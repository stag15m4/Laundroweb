import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parts = await prisma.partInventory.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { usages: true } } },
  });
  return NextResponse.json(parts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  const body = await req.json();

  if (body._action === "restock") {
    // owner or staff can restock
    const part = await prisma.partInventory.update({
      where: { id: body.id },
      data: { quantity: { increment: Number(body.quantity) } },
    });
    return NextResponse.json(part);
  }

  // create new part — owner only
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const part = await prisma.partInventory.create({
    data: {
      name: body.name,
      category: body.category || "general",
      unit: body.unit || "ea",
      quantity: Number(body.quantity) || 0,
      minimumStock: Number(body.minimumStock) || 1,
      costPerUnit: body.costPerUnit ? Number(body.costPerUnit) : null,
      notes: body.notes || null,
    },
    include: { _count: { select: { usages: true } } },
  });
  return NextResponse.json(part, { status: 201 });
}
