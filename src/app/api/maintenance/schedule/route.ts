import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function calcNextDue(frequencyDays: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + frequencyDays);
  return d;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { active: true },
    include: { machine: { select: { id: true, name: true, type: true } } },
    orderBy: { nextDueAt: "asc" },
  });
  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, machineId, machineType, isBuilding, frequencyDays, notes } = body;

  const nextDueAt = calcNextDue(Number(frequencyDays));

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      title,
      description: description || null,
      machineId: machineId || null,
      machineType: machineType || null,
      isBuilding: !!isBuilding,
      frequencyDays: Number(frequencyDays),
      nextDueAt,
      notes: notes || null,
    },
    include: { machine: { select: { id: true, name: true, type: true } } },
  });
  return NextResponse.json(schedule, { status: 201 });
}
