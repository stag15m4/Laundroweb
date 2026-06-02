import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const machines = await prisma.machine.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { maintenanceLogs: true } },
    },
  });
  return NextResponse.json(machines);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const machine = await prisma.machine.create({
    data: {
      name: body.name,
      type: body.type,
      brand: body.brand || null,
      model: body.model || null,
      serialNumber: body.serialNumber || null,
      location: body.location || null,
      installDate: body.installDate ? new Date(body.installDate) : null,
      warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
      status: body.status ?? "OPERATIONAL",
      notes: body.notes || null,
    },
  });
  return NextResponse.json(machine, { status: 201 });
}
