import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RecurringFrequency } from "@prisma/client";

const FREQUENCIES = Object.values(RecurringFrequency);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.recurringExpense.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!category || !description) {
    return NextResponse.json({ error: "category and description are required" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const frequency = body.frequency;
  if (!FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const startDate = body.startDate ? new Date(body.startDate) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
  }

  const template = await prisma.recurringExpense.create({
    data: {
      category,
      description,
      amount,
      frequency,
      startDate,
      vendor: typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
