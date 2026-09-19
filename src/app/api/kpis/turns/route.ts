import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Turns per day — how many times the average washer runs in a day.
 *
 *   TPD = washer cycles ÷ (washers × days)
 *
 * Until the card readers are in, there is no cycle counter anywhere, so cycles
 * are inferred from money: washer revenue ÷ the average price of a wash. That
 * makes this an estimate, and the response carries everything needed to judge
 * how good an estimate it is — the inputs, the assumed vend price, and how
 * much revenue could not be attributed to washers at all.
 *
 * Dryers are excluded on purpose. A turn is a visit, and the wash is what
 * brings someone in; counting dryer cycles as turns double-counts the trip.
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
      select: { id: true, model: true },
    }),
    prisma.revenueEntry.findMany({
      where: { date: { gte: start, lt: end } },
      select: { amount: true, machineType: true, machine: { select: { type: true } } },
    }),
    prisma.machineModelPricing.findMany({ where: { machineType: "WASHER" } }),
  ]);

  // ── Assumed vend: the average offered cycle price, weighted by how many
  //    machines of each model are on the floor. ─────────────────────────────
  const priceByModel = new Map<string, number>();
  for (const record of pricing) {
    const values = CYCLE_KEYS.map((key) => Number((record as Record<string, unknown>)[key]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (values.length > 0) {
      priceByModel.set(record.modelNumber, values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  const priced = washers.filter((w) => w.model && priceByModel.has(w.model));
  const assumedVend =
    priced.length > 0
      ? priced.reduce((sum, w) => sum + priceByModel.get(w.model!)!, 0) / priced.length
      : null;

  // ── Washer revenue, and what could not be attributed ─────────────────────
  let washerRevenue = 0;
  let unattributed = 0;
  let totalRevenue = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    totalRevenue += amount;
    const type = entry.machine?.type ?? entry.machineType ?? null;
    if (type === "WASHER") washerRevenue += amount;
    else if (type === null) unattributed += amount;
  }

  const washerCount = washers.length;
  const canEstimate = Boolean(assumedVend) && washerCount > 0;

  const estimatedTurns = canEstimate ? washerRevenue / assumedVend! : null;
  const turnsPerDay = canEstimate ? estimatedTurns! / (washerCount * days) : null;

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
    inputs: {
      washerRevenue,
      totalRevenue,
      unattributedRevenue: unattributed,
      washerCount,
      days,
      daysInMonth,
      partialMonth: partial,
      assumedVend,
      pricedWashers: priced.length,
      estimatedTurns,
    },
    // Why an estimate is unavailable, so the page can say so instead of
    // rendering a dash with no explanation.
    unavailableReason: canEstimate
      ? null
      : washerCount === 0
      ? "No active washers are recorded."
      : "No washer cycle prices are configured under Equipment → Pricing.",
  });
}
