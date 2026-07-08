import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const machineId = p.get("machineId");

  const logs = await prisma.maintenanceLog.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(machineId ? { machineId } : {}),
    },
    select: {
      id: true, date: true, type: true, description: true, cost: true,
      technician: true, vendor: true, nextDueDate: true, status: true,
      machineId: true,
      machine: { select: { name: true, type: true } },
      partsUsed: {
        select: {
          quantityUsed: true,
          part: { select: { name: true, unit: true, costPerUnit: true } },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    logs.map(l => ({
      ...l,
      cost: l.cost ? Number(l.cost) : null,
      partsUsed: l.partsUsed.map(p => ({
        ...p,
        part: { ...p.part, costPerUnit: p.part.costPerUnit ? Number(p.part.costPerUnit) : null },
      })),
    }))
  );
}
