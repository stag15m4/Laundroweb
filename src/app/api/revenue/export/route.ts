import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MACHINE_TYPE_LABELS: Record<string, string> = { WASHER: "Washers", DRYER: "Dryers", VENDING: "Vending" };

// GET /api/revenue/export?from=<yyyy-mm-dd>&to=<yyyy-mm-dd>
// Read-only JSON feed for the Revenue page's CSV/PDF export -- both are
// built client-side from this same payload (see src/lib/revenue-export.ts),
// so the date-range filtering only has to be correct in one place. `from`
// and `to` are plain calendar days in whatever timezone the browser sent;
// `to` is widened to the end of that day so "11/18" includes everything
// that happened on the 18th, not just up to midnight.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let from: Date | null = null;
  let to: Date | null = null;
  if (fromParam) {
    from = new Date(fromParam);
    if (Number.isNaN(from.getTime())) {
      return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
    }
  }
  if (toParam) {
    to = new Date(toParam);
    if (Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });
    }
    to.setHours(23, 59, 59, 999);
  }

  const dateFilter =
    from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  const [entries, changerLogs] = await Promise.all([
    prisma.revenueEntry.findMany({
      where: dateFilter,
      orderBy: { date: "asc" },
      include: { machine: { select: { name: true } } },
    }),
    prisma.coinChangerLog.findMany({ where: dateFilter, orderBy: { date: "asc" } }),
  ]);

  const revenueTotal = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  const changerTotal = changerLogs.reduce((sum, c) => sum + Number(c.amount), 0);

  return NextResponse.json({
    range: { from: fromParam, to: toParam },
    entries: entries.map((e) => ({
      date: e.date.toISOString(),
      amount: Number(e.amount),
      source: e.source,
      machineLabel: e.machine?.name ?? (e.machineType ? MACHINE_TYPE_LABELS[e.machineType] ?? e.machineType : null),
      collectedBy: e.collectedBy,
      notes: e.notes,
      collectionId: e.collectionId,
    })),
    changerLogs: changerLogs.map((c) => ({
      date: c.date.toISOString(),
      amount: Number(c.amount),
      notes: c.notes,
      collectionId: c.collectionId,
    })),
    totals: {
      revenue: revenueTotal,
      changerCash: changerTotal,
      entryCount: entries.length,
    },
  });
}
