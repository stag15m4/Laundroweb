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
  const data: Prisma.UtilityBillUpdateInput = {};
  if (body.type !== undefined) data.type = body.type;
  if (body.billingPeriodStart !== undefined) data.billingPeriodStart = new Date(body.billingPeriodStart);
  if (body.billingPeriodEnd !== undefined) data.billingPeriodEnd = new Date(body.billingPeriodEnd);
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.usageAmount !== undefined) data.usageAmount = Number(body.usageAmount);
  if (body.usageUnit !== undefined) data.usageUnit = body.usageUnit;
  if (body.cost !== undefined) data.cost = Number(body.cost);
  if (body.provider !== undefined) data.provider = body.provider || null;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const bill = await prisma.utilityBill.update({ where: { id }, data });
  return NextResponse.json(bill);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.utilityBill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
