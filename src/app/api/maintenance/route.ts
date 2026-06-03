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
    include: { machine: { select: { id: true, name: true, type: true } } },
  });
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const log = await prisma.maintenanceLog.create({
    data: {
      machineId: body.machineId || null,
      date: new Date(body.date),
      type: body.type,
      description: body.description,
      cost: body.cost ? Number(body.cost) : null,
      technician: body.technician || null,
      vendor: body.vendor || null,
      nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
      status: body.status ?? "COMPLETED",
    },
    include: { machine: { select: { id: true, name: true, type: true } } },
  });
  return NextResponse.json(log, { status: 201 });
}
