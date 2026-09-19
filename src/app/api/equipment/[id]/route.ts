import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  // Only fields the caller actually sent are touched. The previous version
  // wrote `body.field || null` for the optional columns, so any partial update
  // — sending just a status, say — silently blanked the brand, model, serial
  // number, location, dates and notes.
  const data: Prisma.MachineUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.status !== undefined) data.status = body.status;
  if (body.brand !== undefined) data.brand = body.brand || null;
  if (body.model !== undefined) data.model = body.model || null;
  if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber || null;
  if (body.location !== undefined) data.location = body.location || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.keyCode !== undefined) data.keyCode = body.keyCode || null;
  if (body.cycleCount !== undefined) data.cycleCount = body.cycleCount;
  if (body.installDate !== undefined) {
    data.installDate = body.installDate ? new Date(body.installDate) : null;
  }
  if (body.warrantyExpiry !== undefined) {
    data.warrantyExpiry = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null;
  }

  const machine = await prisma.machine.update({ where: { id }, data });
  return NextResponse.json(machine);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    // Detach related records before hard-deleting the machine
    await tx.maintenanceLog.updateMany({ where: { machineId: id }, data: { machineId: null } });
    await tx.revenueEntry.updateMany({ where: { machineId: id }, data: { machineId: null } });
    await tx.manualDocument.deleteMany({ where: { machineId: id } });
    await tx.machine.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
