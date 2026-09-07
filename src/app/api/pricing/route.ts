import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [machines, pricingRecords] = await Promise.all([
    prisma.machine.findMany({
      where: { type: { in: ["WASHER", "DRYER"] }, status: { not: "RETIRED" } },
      select: { id: true, name: true, type: true, model: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.machineModelPricing.findMany(),
  ]);

  return NextResponse.json({ machines, pricing: pricingRecords });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { machineType, modelNumber, ...prices } = await req.json();

  const record = await prisma.machineModelPricing.upsert({
    where: { machineType_modelNumber: { machineType, modelNumber } },
    update: prices,
    create: { machineType, modelNumber, ...prices },
  });

  return NextResponse.json(record);
}
