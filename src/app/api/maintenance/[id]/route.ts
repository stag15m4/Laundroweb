import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const log = await prisma.maintenanceLog.update({
    where: { id },
    data: {
      status: body.status,
      cost: body.cost !== undefined ? Number(body.cost) : undefined,
      nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : undefined,
    },
    include: { machine: { select: { id: true, name: true, type: true } } },
  });
  return NextResponse.json(log);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.maintenanceLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
