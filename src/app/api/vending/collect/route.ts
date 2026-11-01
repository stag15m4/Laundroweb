import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { coinWeightToDollars, WeightUnit } from "@/lib/revenueCollection";

// Vending has no FasCard reader to recompute against -- a soap center and a
// snack/drink combo are plain cash boxes, so (unlike the washer/dryer tool)
// this never has trusted external data to cross-check. The amount is
// whatever the operator weighed or counted, per machine.

class PeriodOverlapError extends Error {
  constructor(public lastCollectionEnd: string) {
    super(`This period starts before your last saved collection ended (${lastCollectionEnd}).`);
  }
}

function labelInstant(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

type Weight = { value: number; unit: WeightUnit };

function parseWeight(input: unknown): Weight | null {
  if (!input || typeof input !== "object") return null;
  const value = Number((input as { value?: unknown }).value);
  const unit = (input as { unit?: unknown }).unit;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit !== "g" && unit !== "oz") return null;
  return { value, unit };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type MachineInput = { machineId: string; weight: unknown; cashAmount: unknown };

// POST /api/vending/collect
// Saves a vending collection round as one RevenueEntry per vending machine
// (source VENDING, tied to that machine) -- amount is weighed coin plus any
// directly-counted cash (bills a scale can't weigh). machineType is left off
// these rows on purpose: turns-per-day only ever looks at WASHER entries, so
// a vending row needs no special flag to stay out of it, unlike the
// washer/dryer tool's excludesFascardMachines.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const periodStart = body.periodStart ? new Date(body.periodStart) : null;
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
  if (!periodStart || Number.isNaN(periodStart.getTime()) || !periodEnd || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "periodStart and periodEnd must be valid dates" }, { status: 400 });
  }
  if (periodEnd.getTime() <= periodStart.getTime()) {
    return NextResponse.json({ error: "periodEnd must be after periodStart" }, { status: 400 });
  }

  const machineInputs: MachineInput[] = Array.isArray(body.machines) ? body.machines : [];
  if (machineInputs.length === 0) {
    return NextResponse.json({ error: "At least one machine's collection is required." }, { status: 400 });
  }

  const machineIds = machineInputs.map((m) => m.machineId).filter((id): id is string => typeof id === "string");
  const machines = await prisma.machine.findMany({
    where: { id: { in: machineIds }, type: "VENDING" },
    select: { id: true, name: true },
  });
  const machineById = new Map(machines.map((m) => [m.id, m]));

  const collectedBy = typeof body.collectedBy === "string" && body.collectedBy.trim() ? body.collectedBy.trim() : null;
  const confirmOverlap = body.confirmOverlap === true;
  const periodLabel = `${labelInstant(periodStart)} to ${labelInstant(periodEnd)}`;

  const rows: { machineId: string; amount: number; notes: string }[] = [];
  const summary: { machineId: string; machineName: string; amount: number }[] = [];

  for (const input of machineInputs) {
    const machine = machineById.get(input.machineId);
    if (!machine) {
      return NextResponse.json({ error: `Unknown vending machine: ${input.machineId}` }, { status: 400 });
    }

    const weight = input.weight != null ? parseWeight(input.weight) : null;
    if (input.weight != null && !weight) {
      return NextResponse.json(
        { error: `${machine.name}: weight must be a positive number with unit 'g' or 'oz'` },
        { status: 400 }
      );
    }
    let cashAmount: number | null = null;
    if (input.cashAmount != null) {
      cashAmount = Number(input.cashAmount);
      if (!Number.isFinite(cashAmount) || cashAmount < 0) {
        return NextResponse.json({ error: `${machine.name}: cashAmount must be a non-negative number` }, { status: 400 });
      }
    }

    const weightDollars = weight ? coinWeightToDollars(weight.value, weight.unit) : 0;
    const amount = round2(weightDollars + (cashAmount ?? 0));
    summary.push({ machineId: machine.id, machineName: machine.name, amount });
    if (amount <= 0) continue;

    const parts: string[] = [];
    if (weight) parts.push(`${weight.value} ${weight.unit} coin`);
    if (cashAmount) parts.push(`$${cashAmount.toFixed(2)} counted cash`);
    rows.push({
      machineId: machine.id,
      amount,
      notes: `Vending collection, ${machine.name}, ${periodLabel}${parts.length ? ` (${parts.join(", ")})` : ""}.`,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to save -- every machine came back at $0." }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // Same overlap-safe pattern as /api/revenue/collect: the cursor
        // check and update happen inside the same serializable transaction
        // as the inserts, so two concurrent saves can't both read the
        // "not yet moved" cursor and both pass.
        const cursor = await tx.setting.findUnique({ where: { key: "vending.lastCollectionEnd" } });
        const cursorMs = cursor ? new Date(cursor.value).getTime() : null;
        if (cursorMs != null && !Number.isNaN(cursorMs) && !confirmOverlap && periodStart.getTime() < cursorMs) {
          throw new PeriodOverlapError(cursor!.value);
        }

        // One id shared by every row this round creates, so the dashboard
        // can show one total per pull instead of one row per machine.
        const collectionId = randomUUID();

        const entries = await Promise.all(
          rows.map((row) =>
            tx.revenueEntry.create({
              data: {
                date: periodEnd,
                amount: row.amount,
                source: "VENDING",
                machineId: row.machineId,
                notes: row.notes,
                collectedBy,
                collectionId,
              },
            })
          )
        );

        // Only advance the cursor, never move it backward. A backfilled
        // historical period (confirmed past the overlap warning above) ends
        // before the cursor already does -- overwriting it unconditionally
        // would roll the "next collection starts here" point back in time,
        // silently disabling the overlap check for the periods that come
        // after it.
        if (cursorMs == null || Number.isNaN(cursorMs) || periodEnd.getTime() > cursorMs) {
          await tx.setting.upsert({
            where: { key: "vending.lastCollectionEnd" },
            update: { value: periodEnd.toISOString() },
            create: { key: "vending.lastCollectionEnd", value: periodEnd.toISOString() },
          });
        }

        return entries;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ entries: created, summary });
  } catch (err) {
    if (err instanceof PeriodOverlapError) {
      return NextResponse.json(
        { error: "period_overlap", message: err.message, lastCollectionEnd: err.lastCollectionEnd },
        { status: 409 }
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return NextResponse.json(
        { error: "concurrent_save", message: "Another collection was saved at the same moment. Please try again." },
        { status: 409 }
      );
    }
    throw err;
  }
}
