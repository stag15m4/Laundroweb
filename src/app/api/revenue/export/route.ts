import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MACHINE_TYPE_LABELS: Record<string, string> = { WASHER: "Washers", DRYER: "Dryers", VENDING: "Vending" };

// GET /api/revenue/export?from=<ISO instant>&to=<ISO instant>&fromLabel=<yyyy-mm-dd>&toLabel=<yyyy-mm-dd>
// Read-only JSON feed for the Revenue page's CSV/PDF export -- both are
// built client-side from this same payload (see src/lib/revenue-export.ts),
// so the date-range filtering only has to be correct in one place.
//
// `from`/`to` are exact instants, already resolved to the *browser's* local
// day boundaries by the caller (same reasoning as CollectQuartersDialog's
// own toIso() helper: a plain "yyyy-MM-dd" has no timezone of its own, and
// resolving it here, on the server, would silently use the server's
// timezone instead of whatever the person picking the range actually meant
// by "the 18th"). `to` is the start of the day *after* the selected end
// day (exclusive), not that day's end -- simpler than reconstructing
// "23:59:59.999 in a timezone the server doesn't know" from an instant.
// `fromLabel`/`toLabel` are the original plain calendar days, carried
// through only for display in the exported file's header -- never parsed
// as dates themselves.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const fromLabel = searchParams.get("fromLabel");
  const toLabel = searchParams.get("toLabel");

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
  }

  const dateFilter =
    from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
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
    range: { from: fromLabel, to: toLabel },
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
