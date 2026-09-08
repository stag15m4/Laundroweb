import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { prisma } from "@/lib/prisma";

const WASHER_PRICE_FIELDS = [
  { code: "ATS1", label: "Hot",               key: "ats1" },
  { code: "ATS2", label: "Warm",              key: "ats2" },
  { code: "ATS3", label: "Cold",              key: "ats3" },
  { code: "ATS4", label: "Blankets Cold",     key: "ats4" },
  { code: "ATS5", label: "Delicate Warm",     key: "ats5" },
  { code: "ATS6", label: "Delicate Cold",     key: "ats6" },
  { code: "CnP1", label: "Extra Wash",        key: "cnp1" },
  { code: "CnP2", label: "Extra Rinse",       key: "cnp2" },
] as const;

const DRYER_PRICE_FIELDS = [
  { code: "ATSH", label: "Price",             key: "atsh", unit: "USD"     },
  { code: "CYC",  label: "Cycle Time",        key: "cyc",  unit: "minutes" },
] as const;

type PricingRecord = Record<string, string | null>;

function buildPricing(type: string, record: PricingRecord | null) {
  if (!record) return null;
  const fields = type === "WASHER" ? WASHER_PRICE_FIELDS : DRYER_PRICE_FIELDS;
  return (fields as readonly { code: string; label: string; key: string; unit?: string }[]).map(({ code, label, key, unit }) => ({
    code,
    label,
    value: record[key] ?? null,
    ...(unit ? { unit } : {}),
  }));
}

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const [machines, pricingRows] = await Promise.all([
    prisma.machine.findMany({
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
    }),
    prisma.machineModelPricing.findMany(),
  ]);

  const pricingMap = new Map(
    pricingRows.map(p => [`${p.machineType}:${p.modelNumber}`, p as PricingRecord])
  );

  return NextResponse.json(
    machines.map(m => ({
      ...m,
      pricing: buildPricing(m.type, pricingMap.get(`${m.type}:${m.model ?? ""}`) ?? null),
      maintenanceCostTotal: m.maintenanceLogs.reduce(
        (s, l) => s + (l.cost ? Number(l.cost) : 0), 0
      ),
      maintenanceLogs: m.maintenanceLogs.map(l => ({
        ...l, cost: l.cost ? Number(l.cost) : null,
      })),
    }))
  );
}
