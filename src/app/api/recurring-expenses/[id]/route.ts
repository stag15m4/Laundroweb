import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, RecurringFrequency } from "@prisma/client";

const FREQUENCIES = Object.values(RecurringFrequency);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  // Only touch fields the caller actually sent, so a partial edit (e.g. just
  // toggling `active`) cannot blank out the rest of the template.
  const data: Prisma.RecurringExpenseUpdateInput = {};

  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !body.category.trim()) {
      return NextResponse.json({ error: "category must be a non-empty string" }, { status: 400 });
    }
    data.category = body.category.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim()) {
      return NextResponse.json({ error: "description must be a non-empty string" }, { status: 400 });
    }
    data.description = body.description.trim();
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    data.amount = amount;
  }
  if (body.frequency !== undefined) {
    if (!FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
    }
    data.frequency = body.frequency;
  }
  if (body.startDate !== undefined) {
    const startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
    }
    data.startDate = startDate;
  }
  if (body.vendor !== undefined) data.vendor = body.vendor || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.active !== undefined) data.active = Boolean(body.active);

  const template = await prisma.recurringExpense.update({ where: { id }, data });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  // Expense.recurringExpenseId is onDelete: SetNull, so every Expense row
  // this template already generated stays exactly as it is -- it's
  // ordinary expense history at this point, not tied to the template's
  // lifecycle.
  await prisma.recurringExpense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
