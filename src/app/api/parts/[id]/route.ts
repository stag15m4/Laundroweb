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
  const part = await prisma.partInventory.update({
    where: { id },
    data: {
      name: body.name,
      category: body.category || "general",
      unit: body.unit || "ea",
      minimumStock: body.minimumStock !== undefined ? Number(body.minimumStock) : undefined,
      costPerUnit: body.costPerUnit !== undefined ? (body.costPerUnit ? Number(body.costPerUnit) : null) : undefined,
      notes: body.notes !== undefined ? (body.notes || null) : undefined,
    },
    include: { _count: { select: { usages: true } } },
  });
  return NextResponse.json(part);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const count = await prisma.maintenancePartUsage.count({ where: { partId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — this part appears in ${count} maintenance log(s)` },
      { status: 409 }
    );
  }
  await prisma.partInventory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
