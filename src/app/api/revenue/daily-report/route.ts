import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Owner-reviewed daily totals only. The weekly cumulative column and
// reader coin amounts must never be added to the revenue ledger.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const day = body?.day;
  const date = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(day + "T12:00:00.000Z") : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || day >= today) {
    return NextResponse.json({ error: "Choose a completed business day." }, { status: 400 });
  }
  const validMoney = (value: unknown): value is string =>
    typeof value === "string" && /^\d{1,8}(\.\d{1,2})?$/.test(value);
  if (!validMoney(body.coin) || !validMoney(body.card) || body.confirmed !== true) {
    return NextResponse.json({ error: "Enter both daily amounts and confirm card revenue has not already been recorded." }, { status: 400 });
  }
  try {
    const entry = await prisma.revenueEntry.create({
      data: {
        id: `fascard-daily-${day}`,
        date,
        amount: body.card,
        source: "CARD",
        notes: `FasCard daily income report for ${day}. Reader coin: $${Number(body.coin).toFixed(2)} (reference only; included in physical coin collection). Machine-start card: $${Number(body.card).toFixed(2)}. Washer/dryer breakdown not available.`,
        collectedBy: session.user?.name ?? null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A daily report for this date already exists. Review the existing revenue entry before making a correction." }, { status: 409 });
    }
    throw error;
  }
}
