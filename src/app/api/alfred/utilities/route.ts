import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";
import { UtilityType } from "@prisma/client";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const type = p.get("type") as UtilityType | null;

  const bills = await prisma.utilityBill.findMany({
    where: {
      ...(from || to
        ? { billingPeriodStart: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(type && Object.values(UtilityType).includes(type) ? { type } : {}),
    },
    orderBy: { billingPeriodStart: "desc" },
  });

  return NextResponse.json(
    bills.map(b => ({ ...b, cost: Number(b.cost), usageAmount: Number(b.usageAmount) }))
  );
}
