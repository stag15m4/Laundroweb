import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
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

  const depositedBy = typeof body.depositedBy === "string" && body.depositedBy.trim() ? body.depositedBy.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  class OverdraftError extends Error {
    constructor(public cashOnHand: number) {
      super(`Cash on Hand is only $${cashOnHand.toFixed(2)} -- can't deposit more than that.`);
    }
  }

  try {
    // Reading the balance and inserting the deposit have to happen in the
    // same serializable transaction -- otherwise two deposits submitted at
    // the same time can both read the same balance, both pass the
    // overdraft check, and together spend more cash than was ever on hand.
    const deposit = await prisma.$transaction(
      async (tx) => {
        const [vending, changer, deposits] = await Promise.all([
          tx.revenueEntry.aggregate({ where: { source: "VENDING" }, _sum: { amount: true } }),
          tx.coinChangerLog.aggregate({ _sum: { amount: true } }),
          tx.cashDeposit.aggregate({ _sum: { amount: true } }),
        ]);
        const cashOnHand =
          Number(vending._sum.amount ?? 0) + Number(changer._sum.amount ?? 0) - Number(deposits._sum.amount ?? 0);

        if (amount > cashOnHand + 0.01) {
          throw new OverdraftError(cashOnHand);
        }

        return tx.cashDeposit.create({ data: { date, amount, depositedBy, notes } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return NextResponse.json(deposit, { status: 201 });
  } catch (err) {
    if (err instanceof OverdraftError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return NextResponse.json(
        { error: "Another deposit was saved at the same moment. Please try again." },
        { status: 409 }
      );
    }
    throw err;
  }
}
