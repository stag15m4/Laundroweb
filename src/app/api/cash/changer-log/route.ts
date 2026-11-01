import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/cash/changer-log
// Coin changer cash is logged separately from RevenueEntry (it's not
// revenue), so a period-level view that wants to include it -- grouping a
// Collect Quarters pull's total, or a Reports period's cash breakdown --
// needs its own list rather than reading it only as the running aggregate
// /api/cash/summary already exposes.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.coinChangerLog.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(logs);
}
