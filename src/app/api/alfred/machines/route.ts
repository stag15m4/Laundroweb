import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import {
  alfredError,
  consumeProposal,
  createProposal,
  PROPOSAL_TTL_SECONDS,
} from "@/lib/alfred-write";
import { validateStatusChange, writeStatusChange, type StatusPayload } from "./write";
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
    pricingRows.map(p => [`${p.machineType}:${p.modelNumber}`, p as unknown as PricingRecord])
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


// ── Write: propose, then confirm ───────────────────────────────────────────

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "machine-status";

/**
 * One endpoint, two steps. A body without `confirmationToken` validates and
 * returns a token plus a summary, writing nothing; a body carrying only the
 * token applies that change.
 */
export async function POST(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return alfredError(400, "invalid_json", "The request body could not be parsed as JSON.");
  }

  if (body.confirmationToken !== undefined) {
    const claim = await consumeProposal(RESOURCE, body.confirmationToken);
    if (!claim.ok) return claim.response;

    const machine = await writeStatusChange(claim.payload as StatusPayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      machineId: machine.id,
      record: machine,
    });
  }

  const validated = await validateStatusChange(body);
  if (!validated.ok) return validated.response;

  const { confirmationToken, expiresAt } = await createProposal(
    RESOURCE,
    validated.payload as unknown as Prisma.InputJsonValue,
    validated.summary
  );

  return NextResponse.json({
    status: "proposed",
    summary: validated.summary,
    confirmationToken,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: PROPOSAL_TTL_SECONDS,
    details: validated.payload,
  });
}
