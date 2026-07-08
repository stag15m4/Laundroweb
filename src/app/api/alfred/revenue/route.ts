import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";
import { RevenueSource } from "@prisma/client";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const source = p.get("source") as RevenueSource | null;

  const entries = await prisma.revenueEntry.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(source && Object.values(RevenueSource).includes(source) ? { source } : {}),
    },
    select: {
      id: true, date: true, amount: true, source: true,
      machineId: true,
      machine: { select: { name: true, type: true } },
      notes: true, collectedBy: true,
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries.map(e => ({ ...e, amount: Number(e.amount) })));
}
