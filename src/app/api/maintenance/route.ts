import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const machineId = new URL(req.url).searchParams.get("machineId");
  const where = machineId === "building"
    ? { machineId: null }
    : machineId
    ? { machineId }
    : undefined;

  const logs = await prisma.maintenanceLog.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      machine: { select: { id: true, name: true, type: true } },
      partsUsed: {
        include: { part: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
      },
    },
  });
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parts: { partId: string; quantityUsed: number }[] = body.parts ?? [];

  const logData = {
    machineId: body.machineId || null,
    date: new Date(body.date),
    type: body.type,
    description: body.description,
    cost: body.cost ? Number(body.cost) : null,
    technician: body.technician || null,
    vendor: body.vendor || null,
    nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
    status: body.status ?? "COMPLETED",
  };

  const include = {
    machine: { select: { id: true, name: true, type: true } },
    partsUsed: {
      include: { part: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
    },
  };

  if (parts.length === 0) {
    const log = await prisma.maintenanceLog.create({ data: logData, include });
    return NextResponse.json(log, { status: 201 });
  }

  // Atomic: create log + part usage records + decrement inventory
  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceLog.create({ data: logData, include });
    await Promise.all(
      parts.map(({ partId, quantityUsed }) =>
        tx.maintenancePartUsage.create({
          data: { maintenanceLogId: created.id, partId, quantityUsed },
        })
      )
    );
    await Promise.all(
      parts.map(({ partId, quantityUsed }) =>
        tx.partInventory.update({
          where: { id: partId },
          data: { quantity: { decrement: quantityUsed } },
        })
      )
    );
    // Re-fetch with full includes after creating usages
    return tx.maintenanceLog.findUniqueOrThrow({ where: { id: created.id }, include });
  });

  return NextResponse.json(log, { status: 201 });
}
