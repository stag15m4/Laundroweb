import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const machine = await prisma.machine.update({
    where: { id },
    data: {
      name: body.name,
      type: body.type,
      brand: body.brand || null,
      model: body.model || null,
      serialNumber: body.serialNumber || null,
      location: body.location || null,
      installDate: body.installDate ? new Date(body.installDate) : null,
      warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
      status: body.status,
      notes: body.notes || null,
      keyCode: body.keyCode !== undefined ? (body.keyCode || null) : undefined,
      cycleCount: body.cycleCount ?? undefined,
    },
  });
  return NextResponse.json(machine);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.machine.update({ where: { id }, data: { status: "RETIRED" } });
  return NextResponse.json({ ok: true });
}
