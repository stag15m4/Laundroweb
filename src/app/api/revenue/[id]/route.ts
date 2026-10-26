import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const date = body.date ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "date must be a valid date" }, { status: 400 });
  }
  // Validated as a number, but passed to Prisma as the original string --
  // same as the POST route -- so a Decimal column gets exact decimal input
  // instead of a float that happens to round back correctly.
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  // excludesFascardMachines is deliberately left untouched here -- it's a
  // flag the Collect Quarters tool sets to keep the turns-per-day KPI
  // accurate, not something a manual field edit (date, notes, who collected
  // it, ...) should ever reset.
  const entry = await prisma.revenueEntry.update({
    where: { id },
    data: {
      date,
      amount: body.amount,
      source: body.source,
      machineId: body.machineId || null,
      machineType: body.machineType || null,
      notes: body.notes || null,
      collectedBy: body.collectedBy || null,
    },
    include: { machine: { select: { id: true, name: true } } },
  });

  return NextResponse.json(entry);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.revenueEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
