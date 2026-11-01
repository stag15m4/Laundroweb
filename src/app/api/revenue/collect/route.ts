import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { coinWeightToDollars, fascardCategoryTotals, WeightUnit } from "@/lib/revenueCollection";

class PeriodOverlapError extends Error {
  // lastCollectionEnd is the raw ISO instant -- the client re-renders it in
  // the viewer's own timezone rather than trusting a server-rendered string,
  // since this server has no idea what "local" means for whoever's reading it.
  constructor(public lastCollectionEnd: string) {
    super(`This period starts before your last saved collection ended (${lastCollectionEnd}).`);
  }
}

// A human-readable instant for the notes text. Expressed in UTC and labeled
// as such -- this route runs wherever it's deployed, not necessarily in the
// shop's own timezone, so claiming a "local" time here would just be a guess.
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

// POST /api/revenue/collect
// Saves a washer/dryer quarter collection: FasCard-reported revenue for
// reader-equipped machines (recomputed here, never trusted from the client)
// plus the operator's weighed-coin totals for everything else, as one or
// more RevenueEntry rows per category. Cash removed from the coin changer
// isn't revenue -- it's bills already exchanged for quarters, not new
// money -- so it never becomes a RevenueEntry; it's logged as its own
// CoinChangerLog row instead, which is what feeds Cash on Hand.
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

  const washerCoinWeight = body.washerCoinWeight != null ? parseWeight(body.washerCoinWeight) : null;
  if (body.washerCoinWeight != null && !washerCoinWeight) {
    return NextResponse.json({ error: "washerCoinWeight must be a positive number with unit 'g' or 'oz'" }, { status: 400 });
  }
  const dryerCoinWeight = body.dryerCoinWeight != null ? parseWeight(body.dryerCoinWeight) : null;
  if (body.dryerCoinWeight != null && !dryerCoinWeight) {
    return NextResponse.json({ error: "dryerCoinWeight must be a positive number with unit 'g' or 'oz'" }, { status: 400 });
  }

  let changerCash: number | null = null;
  if (body.changerCash != null) {
    changerCash = Number(body.changerCash);
    if (!Number.isFinite(changerCash) || changerCash < 0) {
      return NextResponse.json({ error: "changerCash must be a non-negative number" }, { status: 400 });
    }
  }

  const collectedBy = typeof body.collectedBy === "string" && body.collectedBy.trim() ? body.collectedBy.trim() : null;
  const confirmOverlap = body.confirmOverlap === true;

  const fascard = await fascardCategoryTotals(periodStart, periodEnd);
  if (fascard.error) {
    return NextResponse.json({ error: `FasCard lookup failed: ${fascard.error}` }, { status: 502 });
  }

  const washerCoinDollars = washerCoinWeight ? coinWeightToDollars(washerCoinWeight.value, washerCoinWeight.unit) : 0;
  const dryerCoinDollars = dryerCoinWeight ? coinWeightToDollars(dryerCoinWeight.value, dryerCoinWeight.unit) : 0;

  const periodLabel = `${labelInstant(periodStart)} to ${labelInstant(periodEnd)}`;

  const rows: {
    date: Date;
    amount: number;
    source: "COIN" | "CARD" | "OTHER";
    machineType: "WASHER" | "DRYER";
    notes: string;
    collectedBy: string | null;
    excludesFascardMachines?: boolean;
  }[] = [];

  if (fascard.washer.cash > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.washer.cash),
      source: "COIN",
      machineType: "WASHER",
      notes: `FasCard-reported coin vends, reader-equipped washers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (fascard.washer.card > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.washer.card),
      source: "CARD",
      machineType: "WASHER",
      notes: `FasCard-reported card vends, reader-equipped washers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (washerCoinDollars > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(washerCoinDollars),
      source: "COIN",
      machineType: "WASHER",
      notes: `Weighed coin collection, non-FasCard washers, ${periodLabel} (${washerCoinWeight!.value} ${washerCoinWeight!.unit}).`,
      collectedBy,
      excludesFascardMachines: true,
    });
  }
  if (fascard.dryer.cash > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.dryer.cash),
      source: "COIN",
      machineType: "DRYER",
      notes: `FasCard-reported coin vends, reader-equipped dryers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (fascard.dryer.card > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.dryer.card),
      source: "CARD",
      machineType: "DRYER",
      notes: `FasCard-reported card vends, reader-equipped dryers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (dryerCoinDollars > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(dryerCoinDollars),
      source: "COIN",
      machineType: "DRYER",
      notes: `Weighed coin collection, non-FasCard dryers, ${periodLabel} (${dryerCoinWeight!.value} ${dryerCoinWeight!.unit}).`,
      collectedBy,
      excludesFascardMachines: true,
    });
  }

  if (rows.length === 0 && !changerCash) {
    return NextResponse.json(
      { error: "Nothing to save -- no FasCard revenue, weighed coin, or changer cash was given." },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // The overlap check and the cursor update both have to happen inside
        // the same serializable transaction as the inserts: read-then-write
        // under a weaker isolation level would let two concurrent saves both
        // read the same "not yet moved" cursor and both pass, double-saving
        // the same period. Serializable makes Postgres abort one of them
        // instead (caught below as P2034) rather than let that race through.
        const cursor = await tx.setting.findUnique({ where: { key: "revenue.lastCollectionEnd" } });
        // Timestamp comparison, not a string one -- the cursor may still hold
        // a legacy day-only value ("2026-10-20") from before periods carried
        // time-of-day; Date parses that fine as that day's UTC midnight.
        const cursorMs = cursor ? new Date(cursor.value).getTime() : null;
        if (cursorMs != null && !Number.isNaN(cursorMs) && !confirmOverlap && periodStart.getTime() < cursorMs) {
          throw new PeriodOverlapError(cursor!.value);
        }

        // One id shared by every row this round creates, so the dashboard
        // can show one total per physical pull instead of one row per
        // machine (and per changer-cash line).
        const collectionId = randomUUID();

        const entries = await Promise.all(
          rows.map((row) =>
            tx.revenueEntry.create({
              data: {
                date: row.date,
                amount: row.amount,
                source: row.source,
                machineType: row.machineType,
                notes: row.notes,
                collectedBy: row.collectedBy,
                excludesFascardMachines: row.excludesFascardMachines ?? false,
                collectionId,
              },
            })
          )
        );

        const changerLog = changerCash
          ? await tx.coinChangerLog.create({
              data: {
                date: periodEnd,
                amount: round2(changerCash),
                notes: `Coin changer, collected during the washer/dryer round, ${periodLabel}.`,
                collectionId,
              },
            })
          : null;

        // Only advance the cursor, never move it backward. A backfilled
        // historical period (confirmed past the overlap warning above) ends
        // before the cursor already does -- overwriting it unconditionally
        // would roll the "next collection starts here" point back in time,
        // silently disabling the overlap check for the periods that come
        // after it.
        if (cursorMs == null || Number.isNaN(cursorMs) || periodEnd.getTime() > cursorMs) {
          await tx.setting.upsert({
            where: { key: "revenue.lastCollectionEnd" },
            update: { value: periodEnd.toISOString() },
            create: { key: "revenue.lastCollectionEnd", value: periodEnd.toISOString() },
          });
        }

        return { entries, changerLog };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({
      entries: created.entries,
      summary: {
        washerTotal: round2(fascard.washer.cash + fascard.washer.card + washerCoinDollars),
        dryerTotal: round2(fascard.dryer.cash + fascard.dryer.card + dryerCoinDollars),
        changerCash: created.changerLog ? round2(changerCash!) : null,
      },
    });
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
