import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const category = p.get("category");

  const entries = await prisma.expense.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
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
