import { prisma } from "@/lib/prisma";
/**
 * Turns per day — how many times the average washer runs in a day.
 *
 *   TPD = washer cycles ÷ (washers × days)
 *
 * All washer turns are estimated from recorded washer revenue and average vend price.
 * Unattributed card revenue is not guessed into washer revenue.
 *
 * Dryers are excluded on purpose, measured or not. A turn is a visit, and
 * the wash is what brings someone in; counting dryer cycles as turns
 * double-counts the trip.
 *
 * Pulled out of the turns KPI route so the cost-per-load KPI can reuse the
 * exact same computation for the current month's run rate, rather than
 * re-deriving it (or making a server-to-server HTTP call to itself).
 */

const WEAK = 2;
const HEALTHY = 4;
const AT_CAPACITY = 6;

export const TURNS_THRESHOLDS = { weak: WEAK, healthy: HEALTHY, atCapacity: AT_CAPACITY };

/** Cycle price columns on a washer pricing record. */
const CYCLE_KEYS = ["ats1", "ats2", "ats3", "ats4", "ats5", "ats6"] as const;

export type TurnsResult = {
  month: string;
  turnsPerDay: number | null;
  band: "low" | "building" | "healthy" | "at-capacity" | null;
  thresholds: typeof TURNS_THRESHOLDS;
  totalWasherCount: number;
  days: number;
  daysInMonth: number;
  partialMonth: boolean;
  measured: {
    washerCount: number;
    turns: number | null;
    error: string | null;
    diagnostics: null;
  };
  estimated: {
    washerCount: number;
    washerRevenue: number;
    ambiguousRevenue: number;
    totalRevenue: number;
    unattributedRevenue: number;
    assumedVend: number | null;
    pricedWashers: number;
    estimatedTurns: number | null;
  };
  unavailableReason: string | null;
};

/** `business.openDate` setting, `YYYY-MM-DD`. Null if never set. */
export async function openDate(): Promise<Date | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "business.openDate" } });
  if (!setting || !/^\d{4}-\d{2}-\d{2}$/.test(setting.value)) return null;
  return new Date(`${setting.value}T00:00:00.000Z`);
}

export function monthRange(month: string | null, opened: Date | null) {
  const now = new Date();
  const valid = month && /^\d{4}-\d{2}$/.test(month);
  const year = valid ? Number(month!.slice(0, 4)) : now.getUTCFullYear();
  const mon = valid ? Number(month!.slice(5, 7)) - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(year, mon, 1));
  const end = new Date(Date.UTC(year, mon + 1, 1));
  const label = `${year}-${String(mon + 1).padStart(2, "0")}`;

  // The store wasn't open for the whole month (either this is the opening
  // month itself, or the opening date just wasn't set until today) -- count
  // elapsed days from the opening date, not the 1st, so turns-per-day isn't
  // diluted by days before there was any business to turn.
  const effectiveStart = opened && opened.getTime() > start.getTime() ? opened : start;

  // No operating days have happened yet in this month: either the opening
  // date falls in a later month entirely, or (an owner can enter a future
  // date) it's later this same month than "now" -- either way there's
  // nothing to divide by, and the one-day floor below would otherwise count
  // whatever transactions exist before an opening date that hasn't arrived.
  if (effectiveStart.getTime() >= end.getTime() || effectiveStart.getTime() > now.getTime()) {
    return { start, end, label, days: 0, daysInMonth: 0, partial: true, notYetOpen: true };
  }

  // Days that have actually happened. Dividing a part-month by its full length
  // would report a quiet store that is really only a few days in.
  const daysInMonth = Math.round((end.getTime() - effectiveStart.getTime()) / 86_400_000);
  const elapsed = Math.ceil((now.getTime() - effectiveStart.getTime()) / 86_400_000);
  const days = Math.max(1, Math.min(daysInMonth, elapsed));
  const partial = days < daysInMonth;

  return { start, end, label, days, daysInMonth, partial, notYetOpen: false };
}

export async function computeTurns(month: string | null): Promise<TurnsResult> {
  const { start, end, label, days, daysInMonth, partial, notYetOpen } = monthRange(month, await openDate());

  if (notYetOpen) {
    return {
      month: label,
      turnsPerDay: null,
      band: null,
      thresholds: TURNS_THRESHOLDS,
      totalWasherCount: 0,
      days,
      daysInMonth,
      partialMonth: partial,
      measured: { washerCount: 0, turns: null, error: null, diagnostics: null },
      estimated: {
        washerCount: 0,
        washerRevenue: 0,
        ambiguousRevenue: 0,
        totalRevenue: 0,
        unattributedRevenue: 0,
        assumedVend: null,
        pricedWashers: 0,
        estimatedTurns: null,
      },
      unavailableReason: "Not open yet this month.",
    };
  }

  const [washers, entries, pricing] = await Promise.all([
    prisma.machine.findMany({
      where: { type: "WASHER", status: { not: "RETIRED" } },
      select: { id: true, model: true },
    }),
    prisma.revenueEntry.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        amount: true,
        machineType: true,
        machine: { select: { id: true, type: true } },
      },
    }),
    prisma.machineModelPricing.findMany({ where: { machineType: "WASHER" } }),
  ]);

  const totalWasherCount = washers.length;
  const priceByModel = new Map<string, number>();
  for (const record of pricing) {
    const values = CYCLE_KEYS.map((key) => Number((record as Record<string, unknown>)[key]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (values.length > 0) {
      priceByModel.set(record.modelNumber, values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  const pricedUnmapped = washers.filter((w) => w.model && priceByModel.has(w.model));
  const assumedVend =
    pricedUnmapped.length > 0
      ? pricedUnmapped.reduce((sum, w) => sum + priceByModel.get(w.model!)!, 0) / pricedUnmapped.length
      : null;

  let unmappedWasherRevenue = 0;
  let totalRevenue = 0;
  let unattributed = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    totalRevenue += amount;
    const type = entry.machine?.type ?? entry.machineType ?? null;
    if (type === "WASHER") unmappedWasherRevenue += amount;
    if (type === null) unattributed += amount;
  }

  const canEstimateUnmapped = washers.length === 0 || Boolean(assumedVend);
  const estimatedTurns = washers.length === 0 ? 0 : assumedVend ? unmappedWasherRevenue / assumedVend : null;

  // ── Combine ────────────────────────────────────────────────────────────
  const canCompute = totalWasherCount > 0 && canEstimateUnmapped;
  const combinedTurns = canCompute ? (estimatedTurns ?? 0) : null;
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

  return {
    month: label,
    turnsPerDay,
    band,
    thresholds: TURNS_THRESHOLDS,
    totalWasherCount,
    days,
    daysInMonth,
    partialMonth: partial,
    measured: { washerCount: 0, turns: null, error: null, diagnostics: null },
    estimated: {
      washerCount: washers.length,
      washerRevenue: unmappedWasherRevenue,
      ambiguousRevenue: 0,
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
  };
}
