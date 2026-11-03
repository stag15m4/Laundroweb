import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTurns } from "@/lib/turns";

/**
 * Cost per load = last month's settled fixed costs ÷ this month's projected
 * turns.
 *
 * The two halves are deliberately offset by a month:
 *
 *  - COST side looks at last month, the most recent month that's fully
 *    closed out. Rent/insurance/pest-control-type costs (any Expense row
 *    generated from a RecurringExpense template) are known in advance, but
 *    utility bills arrive in arrears -- the current month almost never has
 *    a bill on file yet. Using last month means never guessing at an unknown
 *    utility bill, at the cost of always running a month behind. Water, gas,
 *    and electric scale with usage rather than swinging independently, so a
 *    month-old bill is still a fair stand-in for this month's usage-driven
 *    cost -- and if cost-per-load drifts up without a usage reason, that's
 *    itself a signal (e.g. a leak) worth checking.
 *
 *  - TURNS side stays live: this month's turns-per-day *so far*
 *    (computeTurns already excludes future days from that rate) projected
 *    across the whole month. Dividing a known monthly cost by only the
 *    turns completed so far would overstate cost per load early in the
 *    month and understate it by the end, for no reason related to actual
 *    cost -- projecting the full month's turns at the current pace is what
 *    makes the number comparable on day 3 and on day 28 alike.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const costMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const costMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const costMonth = `${costMonthStart.getUTCFullYear()}-${String(costMonthStart.getUTCMonth() + 1).padStart(2, "0")}`;

  const [turns, fixedExpenses, utilityBills] = await Promise.all([
    computeTurns(null),
    prisma.expense.findMany({
      where: { recurringExpenseId: { not: null }, date: { gte: costMonthStart, lt: costMonthEnd } },
      select: { amount: true },
    }),
    // Billing periods rarely line up with calendar months, so -- matching
    // the convention the Reports page's own utility breakdown already
    // uses -- a bill counts toward whichever month its billingPeriodEnd
    // falls in, with no day-by-day proration.
    prisma.utilityBill.findMany({
      where: { billingPeriodEnd: { gte: costMonthStart, lt: costMonthEnd } },
      select: { type: true, cost: true },
    }),
  ]);

  const fixedCost = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const utilityCost = utilityBills.reduce((s, u) => s + Number(u.cost), 0);
  const totalCost = fixedCost + utilityCost;

  const utilitiesByType = Object.entries(
    utilityBills.reduce((acc, u) => {
      acc[u.type] = (acc[u.type] ?? 0) + Number(u.cost);
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, cost]) => ({ type, cost }));

  const forecastedTurns =
    turns.turnsPerDay !== null ? turns.turnsPerDay * turns.totalWasherCount * turns.daysInMonth : null;

  const canCompute = forecastedTurns !== null && forecastedTurns > 0 && totalCost > 0;
  const costPerLoad = canCompute ? totalCost / forecastedTurns! : null;

  let unavailableReason: string | null = null;
  if (!canCompute) {
    unavailableReason =
      forecastedTurns === null || forecastedTurns === 0
        ? turns.unavailableReason ?? "Not enough turns data yet to project this month."
        : `No fixed expenses (from a Recurring Expense template) or utility bills are on file for ${costMonth}.`;
  }

  return NextResponse.json({
    costPerLoad,
    costMonth,
    turnsMonth: turns.month,
    forecastedTurns,
    turnsPerDay: turns.turnsPerDay,
    totalWasherCount: turns.totalWasherCount,
    daysInMonth: turns.daysInMonth,
    partialMonth: turns.partialMonth,
    cost: { fixed: fixedCost, utilities: utilityCost, total: totalCost, utilitiesByType },
    unavailableReason,
  });
}
