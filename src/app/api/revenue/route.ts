import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59);
    where.date = { gte: start, lte: end };
  }

  const entries = await prisma.revenueEntry.findMany({
    where,
    orderBy: { date: "desc" },
    include: { machine: { select: { id: true, name: true } } },
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const entry = await prisma.revenueEntry.create({
    data: {
      date: new Date(body.date),
      amount: body.amount,
      source: body.source,
      machineId: body.machineId || null,
      notes: body.notes || null,
      collectedBy: body.collectedBy || null,
    },
    include: { machine: { select: { id: true, name: true } } },
  });

  return NextResponse.json(entry, { status: 201 });
}
