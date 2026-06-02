import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bills = await prisma.utilityBill.findMany({ orderBy: { billingPeriodEnd: "desc" } });
  return NextResponse.json(bills);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const bill = await prisma.utilityBill.create({
    data: {
      type: body.type,
      billingPeriodStart: new Date(body.billingPeriodStart),
      billingPeriodEnd: new Date(body.billingPeriodEnd),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      usageAmount: Number(body.usageAmount),
      usageUnit: body.usageUnit,
      cost: Number(body.cost),
      provider: body.provider || null,
      accountNumber: body.accountNumber || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(bill, { status: 201 });
}
