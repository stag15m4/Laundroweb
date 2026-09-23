import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Service history over a date range, grouped by machine.
 *
 * Building and facility work is stored in the same table with a null
 * machineId — there is no separate building log — so it comes back as its own
 * group rather than a separate feed.
 *
 * Maintenance cost per machine is exact. Revenue per machine is not: a coin
 * collection covering the whole floor carries no machine, so it cannot be
 * attributed to one. The response reports how much revenue in the range could
 * be attributed and how much could not, so the page can say plainly when a
 * cost-versus-revenue comparison is not yet possible.
 */

function parseDay(value: string | null, fallback: Date, endOfDay = false): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;

  // Default to the last twelve months, which is the span most people want.
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  const from = parseDay(params.get("from"), defaultFrom);
  const to = parseDay(params.get("to"), now, true);

  if (from > to) {
    return NextResponse.json(
      { error: "The start date is after the end date." },
      { status: 400 }
    );
  }

  const scope = params.get("scope") ?? "all";
  const machineId = params.get("machineId");

  const where: Prisma.MaintenanceLogWhereInput = { date: { gte: from, lte: to } };
  if (scope === "building") where.machineId = null;
  else if (scope === "machine" && machineId) where.machineId = machineId;

  const [logs, machines, revenueByMachine, revenueTotal] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        machine: { select: { id: true, name: true, type: true, brand: true, model: true, serialNumber: true, status: true } },
        partsUsed: { include: { part: { select: { name: true, unit: true } } } },
      },
    }),
    prisma.machine.findMany({
      where: scope === "machine" && machineId ? { id: machineId } : {},
      select: { id: true, name: true, type: true, brand: true, model: true, serialNumber: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.revenueEntry.groupBy({
      by: ["machineId"],
      where: { date: { gte: from, lte: to }, machineId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.revenueEntry.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const revenueFor = new Map<string, number>();
  for (const row of revenueByMachine) {
    if (row.machineId) revenueFor.set(row.machineId, Number(row._sum.amount ?? 0));
  }
  const attributedRevenue = [...revenueFor.values()].reduce((a, b) => a + b, 0);
  const totalRevenue = Number(revenueTotal._sum.amount ?? 0);

  // ── Group logs: one group per machine that has any, plus the building ────
  type Group = {
    machineId: string | null;
    machineName: string;
    machine: (typeof machines)[number] | null;
    logs: typeof logs;
    totalCost: number;
    revenue: number | null;
  };

  const groups = new Map<string, Group>();
  for (const log of logs) {
    const key = log.machineId ?? "__building__";
    if (!groups.has(key)) {
      groups.set(key, {
        machineId: log.machineId,
        machineName: log.machine?.name ?? "Building / Facility",
        machine: log.machine ?? null,
        logs: [],
        totalCost: 0,
        revenue: log.machineId ? revenueFor.get(log.machineId) ?? 0 : null,
      });
    }
    const group = groups.get(key)!;
    group.logs.push(log);
    group.totalCost += Number(log.cost ?? 0);
  }

  // Machines with no work in the range still belong in a fleet record — their
  // absence is the point when someone is valuing the equipment.
  const machinesWithNoWork =
    scope === "building"
      ? []
      : machines
          .filter((m) => !groups.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, type: m.type, status: m.status }));

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.machineId === null) return 1; // building last
    if (b.machineId === null) return -1;
    return a.machineName.localeCompare(b.machineName);
  });

  const grandTotal = ordered.reduce((sum, g) => sum + g.totalCost, 0);

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    scope,
    groups: ordered.map((g) => ({
      machineId: g.machineId,
      machineName: g.machineName,
      machine: g.machine,
      totalCost: g.totalCost,
      revenue: g.revenue,
      logs: g.logs.map((log) => ({
        id: log.id,
        date: log.date.toISOString(),
        type: log.type,
        description: log.description,
        cost: log.cost === null ? null : Number(log.cost),
        technician: log.technician,
        vendor: log.vendor,
        status: log.status,
        parts: log.partsUsed.map((u) => ({
          name: u.part.name,
          quantityUsed: u.quantityUsed,
          unit: u.part.unit,
        })),
      })),
    })),
    machinesWithNoWork,
    totals: {
      maintenanceCost: grandTotal,
      logCount: logs.length,
      totalRevenue,
      attributedRevenue,
      unattributedRevenue: totalRevenue - attributedRevenue,
    },
  });
}
