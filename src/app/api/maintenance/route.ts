import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcNextDue } from "@/lib/maintenanceSchedule";

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

  // Logging a service can optionally fulfill a recurring MaintenanceSchedule
  // task (e.g. "Clean Trough Filter — Weekly") -- without this, the schedule
  // page and a machine's own service history silently disagree: the history
  // shows the work was done, but the schedule still reads "Never completed"
  // and counts down from its old due date.
  let schedule: { id: string; frequencyDays: number } | null = null;
  if (body.scheduleId) {
    schedule = await prisma.maintenanceSchedule.findUnique({
      where: { id: body.scheduleId },
      select: { id: true, frequencyDays: true },
    });
    if (!schedule) {
      return NextResponse.json({ error: "That maintenance task no longer exists." }, { status: 400 });
    }
  }

  // Single transaction regardless of parts, so a log is never created without
  // its part usage / schedule update, or vice versa.
  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceLog.create({ data: logData, include });

    if (parts.length > 0) {
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
    }

    if (schedule) {
      await tx.maintenanceSchedule.update({
        where: { id: schedule.id },
        data: {
          lastCompletedAt: logData.date,
          nextDueAt: calcNextDue(schedule.frequencyDays, logData.date),
        },
      });
    }

    // Re-fetch with full includes in case parts usage was just attached.
    return tx.maintenanceLog.findUniqueOrThrow({ where: { id: created.id }, include });
  });

  return NextResponse.json({ ...log, scheduleUpdated: Boolean(schedule) }, { status: 201 });
}
