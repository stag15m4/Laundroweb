import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError } from "@/lib/alfred-write";
import { alfredDateRange } from "@/lib/alfred-dates";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const category = p.get("category");

  const range = alfredDateRange(from, to);
  if (range === null) {
    return alfredError(400, "invalid_date", "`from` and `to` must be valid dates, e.g. 2026-10-26.");
  }

  const entries = await prisma.expense.findMany({
    where: {
      ...(range ? { date: range } : {}),
      ...(category ? { category } : {}),
    },
    select: {
      id: true, date: true, category: true, description: true,
      amount: true, vendor: true, notes: true,
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries.map(e => ({ ...e, amount: Number(e.amount) })));
}
