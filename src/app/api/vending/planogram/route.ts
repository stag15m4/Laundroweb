import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const machineId = req.nextUrl.searchParams.get("machineId");
  if (!machineId) return NextResponse.json({ error: "machineId required" }, { status: 400 });

  const slots = await prisma.vendingSlot.findMany({
    where: { machineId },
    include: {
      product: { select: { id: true, name: true, price: true, costPerUnit: true, currentStock: true, minimumStock: true, category: true } },
    },
    orderBy: { slotCode: "asc" },
  });
  return NextResponse.json(slots);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { machineId, slotCode, productId, capacity } = body;

  if (!machineId || !slotCode) {
    return NextResponse.json({ error: "machineId and slotCode required" }, { status: 400 });
  }

  const slot = await prisma.vendingSlot.upsert({
    where: { machineId_slotCode: { machineId, slotCode } },
    update: {
      productId: productId ?? null,
      capacity: capacity ?? 10,
    },
    create: {
      machineId,
      slotCode,
      productId: productId ?? null,
      capacity: capacity ?? 10,
    },
    include: {
      product: { select: { id: true, name: true, price: true, costPerUnit: true, currentStock: true, minimumStock: true, category: true } },
    },
  });
  return NextResponse.json(slot);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const machineId = req.nextUrl.searchParams.get("machineId");
  const slotCode = req.nextUrl.searchParams.get("slotCode");
  if (!machineId || !slotCode) {
    return NextResponse.json({ error: "machineId and slotCode required" }, { status: 400 });
  }

  await prisma.vendingSlot.deleteMany({ where: { machineId, slotCode } });
  return NextResponse.json({ ok: true });
}
