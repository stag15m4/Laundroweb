import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function calcNextDue(frequencyDays: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + frequencyDays);
  return d;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body._action === "complete") {
    const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id } });
    if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const updated = await prisma.maintenanceSchedule.update({
      where: { id },
      data: {
        lastCompletedAt: now,
        nextDueAt: calcNextDue(schedule.frequencyDays, now),
      },
      include: { machine: { select: { id: true, name: true, type: true } } },
    });

    // Optionally log to MaintenanceLog so it shows in machine history
    if (schedule.machineId) {
      await prisma.maintenanceLog.create({
        data: {
          machineId: schedule.machineId,
          date: now,
          type: "Preventive Maintenance",
          description: schedule.title,
          status: "COMPLETED",
        },
      });
    }

    return NextResponse.json(updated);
  }

  // General update
  const { title, description, machineId, machineType, isBuilding, frequencyDays, notes } = body;
  const updated = await prisma.maintenanceSchedule.update({
    where: { id },
    data: {
      title,
      description: description || null,
      machineId: machineId || null,
      machineType: machineType || null,
      isBuilding: !!isBuilding,
      frequencyDays: Number(frequencyDays),
      notes: notes || null,
    },
    include: { machine: { select: { id: true, name: true, type: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.maintenanceSchedule.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
