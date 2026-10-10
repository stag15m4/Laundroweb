import { NextRequest, NextResponse } from "next/server";
import { Prisma, UtilityType } from "@prisma/client";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import {
  alfredError,
  consumeProposal,
  createProposal,
  PROPOSAL_TTL_SECONDS,
} from "@/lib/alfred-write";
import { validateUtilityBill, writeUtilityBill, type UtilityBillPayload } from "./write";
import { prisma } from "@/lib/prisma";

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "utilities";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const type = p.get("type") as UtilityType | null;

  const bills = await prisma.utilityBill.findMany({
    where: {
      ...(from || to
        ? { billingPeriodStart: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(type && Object.values(UtilityType).includes(type) ? { type } : {}),
    },
    orderBy: { billingPeriodStart: "desc" },
  });

  return NextResponse.json(
    bills.map(b => ({ ...b, cost: Number(b.cost), usageAmount: Number(b.usageAmount) }))
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

    const bill = await writeUtilityBill(claim.payload as UtilityBillPayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      utilityBillId: bill.id,
      record: { ...bill, cost: Number(bill.cost), usageAmount: Number(bill.usageAmount) },
    });
  }

  // ── Propose ─────────────────────────────────────────────────────────────
  const validated = await validateUtilityBill(body);
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
