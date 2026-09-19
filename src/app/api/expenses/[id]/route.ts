import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  // Only touch fields the caller actually sent, so a partial edit cannot blank
  // out the rest of the record.
  const data: Prisma.ExpenseUpdateInput = {};
  if (body.date !== undefined) data.date = new Date(body.date);
  if (body.category !== undefined) data.category = body.category;
  if (body.description !== undefined) data.description = body.description;
  if (body.amount !== undefined) data.amount = Number(body.amount);
  if (body.vendor !== undefined) data.vendor = body.vendor || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const expense = await prisma.expense.update({ where: { id }, data });
  return NextResponse.json(expense);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
