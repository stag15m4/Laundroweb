import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";

function parseMonthRange(month: string | null) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end, label: month };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label };
}

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const { start, end, label } = parseMonthRange(req.nextUrl.searchParams.get("month"));

  const [
    revTotal, revBySource,
    utilTotal, utilByType,
    expTotal, expByCategory,
    maintTotal, maintCount,
    machineStatuses,
  ] = await Promise.all([
    prisma.revenueEntry.aggregate({
      where: { date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.revenueEntry.groupBy({
      by: ["source"],
      where: { date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.utilityBill.aggregate({
      where: { billingPeriodStart: { gte: start, lt: end } },
      _sum: { cost: true },
    }),
    prisma.utilityBill.groupBy({
      by: ["type"],
      where: { billingPeriodStart: { gte: start, lt: end } },
      _sum: { cost: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { date: { gte: start, lt: end } },
      _sum: { cost: true },
    }),
    prisma.maintenanceLog.count({ where: { date: { gte: start, lt: end } } }),
    prisma.machine.groupBy({ by: ["status"], _count: { id: true } }),
  ]);

  const revenue = Number(revTotal._sum.amount ?? 0);
  const utilities = Number(utilTotal._sum.cost ?? 0);
  const expenses = Number(expTotal._sum.amount ?? 0);
  const maintenance = Number(maintTotal._sum.cost ?? 0);

  return NextResponse.json({
    month: label,
    revenue: {
      total: revenue,
      bySource: Object.fromEntries(
        revBySource.map(r => [r.source, Number(r._sum.amount ?? 0)])
      ),
    },
    utilities: {
      total: utilities,
      byType: Object.fromEntries(
        utilByType.map(u => [u.type, Number(u._sum.cost ?? 0)])
      ),
    },
    expenses: {
      total: expenses,
      byCategory: Object.fromEntries(
        expByCategory.map(e => [e.category, Number(e._sum.amount ?? 0)])
      ),
    },
    maintenance: { total: maintenance, count: maintCount },
    netIncome: revenue - utilities - expenses - maintenance,
    machines: Object.fromEntries(machineStatuses.map(s => [s.status, s._count.id])),
  });
}
