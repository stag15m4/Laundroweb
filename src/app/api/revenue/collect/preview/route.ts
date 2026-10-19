import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fascardCategoryTotals } from "@/lib/revenueCollection";

// GET /api/revenue/collect/preview?start=YYYY-MM-DD&end=YYYY-MM-DD
// Read-only look at what a collection would pull from FasCard for the given
// window, before anything is saved. The actual save recomputes this itself
// rather than trusting whatever the client last previewed, so this is purely
// advisory -- new transactions landing between preview and save are fine.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const start = startParam ? new Date(startParam) : null;
  const end = endParam ? new Date(endParam) : null;

  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "start and end must be valid dates" }, { status: 400 });
  }
  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: "end must be after start" }, { status: 400 });
  }

  const result = await fascardCategoryTotals(start, end);
  return NextResponse.json(result);
}
