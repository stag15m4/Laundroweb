import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function authorized(req: NextRequest): boolean {
  const key = process.env.ALFRED_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope"); // optional: "pricing" | "machines" | "maintenance" | "revenue"

  const [machines, pricing, maintenance, revenueEntries] = await Promise.all([
    (!scope || scope === "machines" || scope === "pricing")
      ? prisma.machine.findMany({
          where: { status: { not: "RETIRED" } },
          select: {
            id: true, name: true, type: true, brand: true, model: true,
            status: true, location: true, floorZone: true, serialNumber: true,
          },
          orderBy: [{ type: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),

    (!scope || scope === "pricing")
      ? prisma.machineModelPricing.findMany()
      : Promise.resolve([]),

    (!scope || scope === "maintenance")
      ? prisma.maintenanceSchedule.findMany({
          where: { active: true },
          include: { machine: { select: { id: true, name: true, type: true } } },
          orderBy: { nextDueAt: "asc" },
        })
      : Promise.resolve([]),

    (!scope || scope === "revenue")
      ? prisma.revenueEntry.findMany({
          orderBy: { date: "desc" },
          take: 90,
          select: { id: true, date: true, amount: true, source: true, notes: true, collectedBy: true,
            machine: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Attach pricing to machines for convenience
  const pricingByModel = new Map(
    (pricing as Array<{ machineType: string; modelNumber: string }>).map((p) => [`${p.machineType}:${p.modelNumber}`, p])
  );

  const machinesWithPricing = machines.map((m) => ({
    ...m,
    pricing: pricingByModel.get(`${m.type}:${m.model}`) ?? null,
  }));

  // Annotate maintenance tasks with urgency
  const now = Date.now();
  const annotatedMaintenance = (maintenance as Array<{
    nextDueAt: Date | null;
    [key: string]: unknown;
  }>).map((s) => {
    const daysUntil = s.nextDueAt
      ? Math.ceil((new Date(s.nextDueAt).getTime() - now) / 86_400_000)
      : null;
    return {
      ...s,
      daysUntil,
      urgency: daysUntil === null ? "unknown" : daysUntil < 0 ? "overdue" : daysUntil <= 7 ? "due_soon" : "upcoming",
    };
  });

  // Revenue summary
  const revenueTotal = (revenueEntries as Array<{ amount: unknown }>).reduce(
    (sum, e) => sum + Number(e.amount), 0
  );

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    machines: machinesWithPricing,
    maintenance: annotatedMaintenance,
    revenue: {
      entries: revenueEntries,
      total_last_90_entries: revenueTotal,
    },
  });
}
