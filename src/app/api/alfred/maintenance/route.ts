import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import {
  alfredError,
  consumeProposal,
  createProposal,
  PROPOSAL_TTL_SECONDS,
} from "@/lib/alfred-write";
import { validateMaintenance, writeMaintenance, type MaintenancePayload } from "./write";
import { prisma } from "@/lib/prisma";

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "maintenance";

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


// ── Write: propose, then confirm ───────────────────────────────────────────

/**
 * One endpoint, two steps.
 *
 * A body without `confirmationToken` is a proposal: it is validated in full,
 * nothing is written, and a token comes back with a summary for a human to
 * approve. A body containing only `confirmationToken` performs that write.
 * The assistant therefore cannot change anything unilaterally.
 */
export async function POST(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return alfredError(400, "invalid_json", "The request body could not be parsed as JSON.");
  }

  // ── Confirm ─────────────────────────────────────────────────────────────
  if (body.confirmationToken !== undefined) {
    const claim = await consumeProposal(RESOURCE, body.confirmationToken);
    if (!claim.ok) return claim.response;

    const log = await writeMaintenance(claim.payload as MaintenancePayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      maintenanceLogId: log.id,
      record: log,
    });
  }

  // ── Propose ─────────────────────────────────────────────────────────────
  const validated = await validateMaintenance(body);
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
