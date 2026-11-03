import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError, consumeProposal, createProposal, PROPOSAL_TTL_SECONDS } from "@/lib/alfred-write";
import { prisma } from "@/lib/prisma";
import { validateRecurringExpense, writeRecurringExpense, type RecurringExpensePayload } from "./write";

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "recurring-expenses";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const templates = await prisma.recurringExpense.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(templates.map((t) => ({ ...t, amount: Number(t.amount) })));
}

// ── Write: propose, then confirm ───────────────────────────────────────────

/**
 * One endpoint, two steps. A body without `confirmationToken` is a proposal:
 * validated in full, nothing written, a token comes back with a summary for
 * a human to approve. A body containing only `confirmationToken` performs
 * that write. Creating the template here never itself writes an Expense row
 * -- the first (and any catch-up) occurrence is generated the same lazy way
 * a template made from the dashboard gets its first row: on the next load
 * of the Expenses or Reports page.
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

    const template = await writeRecurringExpense(claim.payload as RecurringExpensePayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      recurringExpenseId: template.id,
      record: { ...template, amount: Number(template.amount) },
    });
  }

  // ── Propose ─────────────────────────────────────────────────────────────
  const validated = await validateRecurringExpense(body);
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
