import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const machines = await prisma.machine.findMany({
    select: {
      id: true, name: true, type: true, brand: true, model: true,
      serialNumber: true, status: true, cycleCount: true,
      location: true, floorZone: true, installDate: true, warrantyExpiry: true,
      maintenanceLogs: {
        select: {
          id: true, date: true, type: true, description: true,
          cost: true, status: true, technician: true, vendor: true,
        },
        orderBy: { date: "desc" },
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    machines.map(m => ({
      ...m,
      maintenanceCostTotal: m.maintenanceLogs.reduce(
        (s, l) => s + (l.cost ? Number(l.cost) : 0), 0
      ),
      maintenanceLogs: m.maintenanceLogs.map(l => ({
        ...l, cost: l.cost ? Number(l.cost) : null,
      })),
    }))
  );
}
