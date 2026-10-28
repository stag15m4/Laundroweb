import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/cash/summary
// Cash on Hand: physical cash collected from vending machines and the coin
// changer, not yet deposited to the bank. Deliberately narrower than total
// revenue -- washer/dryer coin (and all card payments) aren't included,
// since that cash is handled through a separate process today.
//
// cashOnHand = (vending revenue + coin changer cash) - deposits made so
// far. A deposit for less than the full balance (holding some back as a
// float) just leaves the difference as the new balance -- there's nothing
// else to track.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [vending, changer, deposits] = await Promise.all([
    prisma.revenueEntry.aggregate({ where: { source: "VENDING" }, _sum: { amount: true } }),
    prisma.coinChangerLog.aggregate({ _sum: { amount: true } }),
    prisma.cashDeposit.aggregate({ _sum: { amount: true } }),
  ]);

  const vendingTotal = Number(vending._sum.amount ?? 0);
  const changerTotal = Number(changer._sum.amount ?? 0);
  const depositTotal = Number(deposits._sum.amount ?? 0);
  const cashIn = vendingTotal + changerTotal;

  return NextResponse.json({
    cashOnHand: Math.round((cashIn - depositTotal) * 100) / 100,
    vendingTotal,
    changerTotal,
    depositTotal,
  });
}
