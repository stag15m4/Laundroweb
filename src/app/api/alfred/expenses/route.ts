import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError, consumeProposal, createProposal, PROPOSAL_TTL_SECONDS } from "@/lib/alfred-write";
import { alfredDateRange } from "@/lib/alfred-dates";
import { prisma } from "@/lib/prisma";
import { validateExpense, writeExpense, type ExpensePayload } from "./write";
import type { Prisma } from "@prisma/client";

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "expenses";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const category = p.get("category");

  const range = alfredDateRange(from, to);
  if (range === null) {
    return alfredError(400, "invalid_date", "`from` and `to` must be valid dates, e.g. 2026-10-26.");
  }

  const entries = await prisma.expense.findMany({
    where: {
      ...(range ? { date: range } : {}),
      ...(category ? { category } : {}),
    },
    select: {
      id: true, date: true, category: true, description: true,
      amount: true, vendor: true, notes: true,
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries.map(e => ({ ...e, amount: Number(e.amount) })));
}

// ── Write: propose, then confirm ───────────────────────────────────────────

/**
 * One endpoint, two steps. A body without `confirmationToken` is a proposal:
 * validated in full, nothing written, a token comes back with a summary for
 * a human to approve. A body containing only `confirmationToken` performs
 * that write.
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

    const expense = await writeExpense(claim.payload as ExpensePayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      expenseId: expense.id,
      record: { ...expense, amount: Number(expense.amount) },
    });
  }

  // ── Propose ─────────────────────────────────────────────────────────────
  const validated = await validateExpense(body);
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
