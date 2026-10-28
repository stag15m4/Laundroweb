import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deposits = await prisma.cashDeposit.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(deposits);
}

// POST /api/cash/deposits
// Records money actually taken to the bank. The amount can be less than
// the current Cash on Hand balance -- holding some back as a float for
// making change -- in which case the difference simply remains as the
// next balance; there's no separate field for what was held back.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const date = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "date must be a valid date" }, { status: 400 });
  }

  const [vending, changer, deposits] = await Promise.all([
    prisma.revenueEntry.aggregate({ where: { source: "VENDING" }, _sum: { amount: true } }),
    prisma.coinChangerLog.aggregate({ _sum: { amount: true } }),
    prisma.cashDeposit.aggregate({ _sum: { amount: true } }),
  ]);
  const cashOnHand =
    Number(vending._sum.amount ?? 0) + Number(changer._sum.amount ?? 0) - Number(deposits._sum.amount ?? 0);

  if (amount > cashOnHand + 0.01) {
    return NextResponse.json(
      { error: `Cash on Hand is only $${cashOnHand.toFixed(2)} -- can't deposit more than that.` },
      { status: 400 }
    );
  }

  const depositedBy = typeof body.depositedBy === "string" && body.depositedBy.trim() ? body.depositedBy.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const deposit = await prisma.cashDeposit.create({
    data: { date, amount, depositedBy, notes },
  });
  return NextResponse.json(deposit, { status: 201 });
}
