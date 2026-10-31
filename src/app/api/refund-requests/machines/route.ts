import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/refund-requests/machines
// Public (no session) -- backs the machine dropdown on the public refund
// request form, which customers fill out with no account. Only the kinds
// of equipment a customer actually puts money into; a water heater or air
// conditioner isn't something they'd be asked to pick.
export async function GET() {
  const machines = await prisma.machine.findMany({
    where: { type: { in: ["WASHER", "DRYER", "VENDING"] } },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(machines);
}
