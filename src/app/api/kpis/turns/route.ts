import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fascardConfigured,
  fascardRecentTransactions,
  TURN_TRANS_TYPE,
  TURN_TRANS_SUBTYPE,
} from "@/lib/fascard";

/**
 * Turns per day — how many times the average washer runs in a day.
 *
 *   TPD = washer cycles ÷ (washers × days)
 *
 * Only 7 machines have FasCard card readers, so cycles come from two
 * different sources depending on the machine:
 *
 *  - A washer with a FasCard reader (Equipment → fascardMachNo set) gets a
 *    real cycle count: FasCard transactions of type "Vend sale / Machine"
 *    (TransType 100, SubType 0) for that machine number, this month.
 *  - A cash-only washer has no FasCard data at all, so its cycles are still
 *    inferred from money: its share of washer revenue ÷ the average price
 *    of a wash. That portion stays an estimate.
 *
 * The response reports both halves separately so the page can show which
 * part of the number is measured and which part is estimated, rather than
 * quietly blending them into one unlabeled figure.
 *
 * Dryers are excluded on purpose, measured or not. A turn is a visit, and
 * the wash is what brings someone in; counting dryer cycles as turns
 * double-counts the trip.
 */

const WEAK = 2;
const HEALTHY = 4;
const AT_CAPACITY = 6;

/** Cycle price columns on a washer pricing record. */
const CYCLE_KEYS = ["ats1", "ats2", "ats3", "ats4", "ats5", "ats6"] as const;

function monthRange(month: string | null) {
  const now = new Date();
  const valid = month && /^\d{4}-\d{2}$/.test(month);
  const year = valid ? Number(month!.slice(0, 4)) : now.getUTCFullYear();
  const mon = valid ? Number(month!.slice(5, 7)) - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(year, mon, 1));
  const end = new Date(Date.UTC(year, mon + 1, 1));
  const label = `${year}-${String(mon + 1).padStart(2, "0")}`;

  // Days that have actually happened. Dividing a part-month by its full length
  // would report a quiet store that is really only a few days in.
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const elapsed = Math.ceil((Date.now() - start.getTime()) / 86_400_000);
  const days = Math.max(1, Math.min(daysInMonth, elapsed));
  const partial = days < daysInMonth;

  return { start, end, label, days, daysInMonth, partial };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { start, end, label, days, daysInMonth, partial } = monthRange(
    req.nextUrl.searchParams.get("month")
  );

  const [washers, entries, pricing] = await Promise.all([
    prisma.machine.findMany({
      where: { type: "WASHER", status: { not: "RETIRED" } },
      select: { id: true, model: true, fascardMachNo: true },
    }),
    prisma.revenueEntry.findMany({
      where: { date: { gte: start, lt: end } },
      select: { amount: true, machineType: true, machine: { select: { id: true, type: true } } },
    }),
    prisma.machineModelPricing.findMany({ where: { machineType: "WASHER" } }),
  ]);

  const mappedWashers = washers.filter((w) => w.fascardMachNo != null);
  const unmappedWashers = washers.filter((w) => w.fascardMachNo == null);
  const totalWasherCount = washers.length;

  // ── Measured half: real counts from FasCard, for washers with a reader ───
  let measuredTurns: number | null = null;
  let measuredError: string | null = null;
  let measuredDiagnostics: Awaited<ReturnType<typeof fascardRecentTransactions>>["diagnostics"] | null = null;

  if (mappedWashers.length > 0 && !fascardConfigured()) {
    // A machine has a FasCard Machine # set, but the FASCARD_* environment
    // variables aren't in place yet -- say so, rather than silently
    // counting those washers as 0 turns with no explanation.
    measuredError = "FasCard isn't configured yet (Settings → FasCard Connection).";
  } else if (mappedWashers.length > 0) {
    try {
      const machNos = new Set(mappedWashers.map((w) => w.fascardMachNo));
      const { transactions, diagnostics } = await fascardRecentTransactions(start);
      measuredTurns = transactions.filter(
        (t) => t.TransType === TURN_TRANS_TYPE && t.TransSubType === TURN_TRANS_SUBTYPE && machNos.has(t.MachNo)
      ).length;
      measuredDiagnostics = diagnostics;
    } catch (err) {
      measuredError = err instanceof Error ? err.message : "Unknown error fetching FasCard transactions";
    }
  }

  // ── Estimated half: revenue ÷ assumed vend, for cash-only washers only ───
  const priceByModel = new Map<string, number>();
  for (const record of pricing) {
    const values = CYCLE_KEYS.map((key) => Number((record as Record<string, unknown>)[key]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (values.length > 0) {
      priceByModel.set(record.modelNumber, values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  const pricedUnmapped = unmappedWashers.filter((w) => w.model && priceByModel.has(w.model));
  const assumedVend =
    pricedUnmapped.length > 0
      ? pricedUnmapped.reduce((sum, w) => sum + priceByModel.get(w.model!)!, 0) / pricedUnmapped.length
      : null;

  const unmappedIds = new Set(unmappedWashers.map((w) => w.id));
  let unmappedWasherRevenue = 0;
  let totalRevenue = 0;
  let unattributed = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    totalRevenue += amount;
    const type = entry.machine?.type ?? entry.machineType ?? null;
    const machineId = entry.machine?.id ?? null;
    if (type === "WASHER" && (machineId === null || unmappedIds.has(machineId))) {
      unmappedWasherRevenue += amount;
    }
    if (type === null) unattributed += amount;
  }

  const canEstimateUnmapped = unmappedWashers.length === 0 || Boolean(assumedVend);
  const estimatedTurns = unmappedWashers.length === 0 ? 0 : assumedVend ? unmappedWasherRevenue / assumedVend : null;

  // ── Combine ────────────────────────────────────────────────────────────
  const canCompute = totalWasherCount > 0 && canEstimateUnmapped;
  const combinedTurns = canCompute ? (measuredTurns ?? 0) + (estimatedTurns ?? 0) : null;
  const turnsPerDay = canCompute ? combinedTurns! / (totalWasherCount * days) : null;

  const band =
    turnsPerDay === null
      ? null
      : turnsPerDay < WEAK
      ? "low"
      : turnsPerDay < HEALTHY
      ? "building"
      : turnsPerDay < AT_CAPACITY
      ? "healthy"
      : "at-capacity";

  return NextResponse.json({
    month: label,
    turnsPerDay,
    band,
    thresholds: { weak: WEAK, healthy: HEALTHY, atCapacity: AT_CAPACITY },
    totalWasherCount,
    days,
    daysInMonth,
    partialMonth: partial,
    measured: {
      washerCount: mappedWashers.length,
      turns: measuredTurns,
      error: measuredError,
      diagnostics: measuredDiagnostics,
    },
    estimated: {
      washerCount: unmappedWashers.length,
      washerRevenue: unmappedWasherRevenue,
      totalRevenue,
      unattributedRevenue: unattributed,
      assumedVend,
      pricedWashers: pricedUnmapped.length,
      estimatedTurns,
    },
    unavailableReason: canCompute
      ? null
      : totalWasherCount === 0
      ? "No active washers are recorded."
      : "No washer cycle prices are configured under Equipment → Pricing.",
  });
}
