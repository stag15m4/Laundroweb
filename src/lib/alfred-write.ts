import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Shared machinery for Alfred's two-step writes.
 *
 * A propose call validates everything and stores the resolved values without
 * touching the real tables. A confirm call presents the token and performs the
 * write. The assistant therefore cannot change anything on its own — a human
 * has to approve the summary in between.
 */

/** How long a proposal stays confirmable. */
export const PROPOSAL_TTL_SECONDS = 300;

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Every failure carries a stable `error` code and a `message` written for a
 * person, because Alfred relays the message rather than the status code.
 */
export function alfredError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

// ── Proposals ──────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createProposal(
  resource: string,
  payload: Prisma.InputJsonValue,
  summary: string
): Promise<{ confirmationToken: string; expiresAt: Date }> {
  const confirmationToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_SECONDS * 1000);

  await prisma.alfredProposal.create({
    data: { tokenHash: hashToken(confirmationToken), resource, payload, summary, expiresAt },
  });

  return { confirmationToken, expiresAt };
}

export type ConsumeResult =
  | { ok: true; payload: unknown; summary: string }
  | { ok: false; response: NextResponse };

/**
 * Claims a proposal for writing. Marking it consumed is a conditional update,
 * so two confirmations racing the same token cannot both win.
 */
export async function consumeProposal(
  resource: string,
  confirmationToken: unknown
): Promise<ConsumeResult> {
  if (typeof confirmationToken !== "string" || confirmationToken.length === 0) {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_confirmation_token",
        "No confirmationToken was supplied. Send the token returned by the propose call."
      ),
    };
  }

  const proposal = await prisma.alfredProposal.findUnique({
    where: { tokenHash: hashToken(confirmationToken) },
  });

  if (!proposal) {
    return {
      ok: false,
      response: alfredError(
        404,
        "unknown_confirmation_token",
        "That confirmation token does not match any proposal. Make the propose call again to get a new one."
      ),
    };
  }

  if (proposal.resource !== resource) {
    return {
      ok: false,
      response: alfredError(
        409,
        "wrong_endpoint",
        `That token was issued for "${proposal.resource}" and cannot be confirmed at "${resource}". Send it to the endpoint that produced it.`
      ),
    };
  }

  if (proposal.consumedAt) {
    return {
      ok: false,
      response: alfredError(
        409,
        "already_confirmed",
        `That proposal was already confirmed at ${proposal.consumedAt.toISOString()}. It cannot be applied twice — propose again if you need to repeat it.`
      ),
    };
  }

  if (proposal.expiresAt <= new Date()) {
    return {
      ok: false,
      response: alfredError(
        410,
        "expired_confirmation_token",
        `That proposal expired at ${proposal.expiresAt.toISOString()}. Proposals are valid for ${PROPOSAL_TTL_SECONDS / 60} minutes — make the propose call again.`
      ),
    };
  }

  const claimed = await prisma.alfredProposal.updateMany({
    where: { id: proposal.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (claimed.count === 0) {
    return {
      ok: false,
      response: alfredError(
        409,
        "already_confirmed",
        "That proposal was confirmed by another request a moment ago. It cannot be applied twice."
      ),
    };
  }

  return { ok: true, payload: proposal.payload, summary: proposal.summary };
}

// ── Machine lookup ─────────────────────────────────────────────────────────

export type MachineMatch =
  | { ok: true; machine: { id: string; name: string; type: string; status: string } }
  | { ok: false; response: NextResponse };

/**
 * Resolves the `machine` field, which Alfred may send as an id, a serial
 * number or a name. Narrows from exact matches outward and refuses to guess
 * between several partial matches — writing to the wrong machine is worse than
 * asking again.
 */
export async function resolveMachine(input: unknown): Promise<MachineMatch> {
  if (typeof input !== "string" || input.trim() === "") {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_machine",
        "No machine was supplied. Send its name (for example W30-6), its serial number or its id."
      ),
    };
  }

  const query = input.trim();
  const select = { id: true, name: true, type: true, status: true };

  const exact = await prisma.machine.findFirst({
    where: { OR: [{ id: query }, { serialNumber: query }, { name: { equals: query, mode: "insensitive" } }] },
    select,
  });
  if (exact) return { ok: true, machine: exact };

  const partial = await prisma.machine.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    select,
    take: 11,
  });

  if (partial.length === 0) {
    return {
      ok: false,
      response: alfredError(
        404,
        "machine_not_found",
        `No machine matches "${query}". Check the name, serial number or id.`
      ),
    };
  }

  if (partial.length > 1) {
    const names = partial.slice(0, 10).map((m) => m.name);
    return {
      ok: false,
      response: alfredError(
        409,
        "ambiguous_machine",
        `"${query}" matches ${partial.length} machines: ${names.join(", ")}${
          partial.length > 10 ? ", …" : ""
        }. Send the exact name or the serial number.`,
        { candidates: names }
      ),
    };
  }

  return { ok: true, machine: partial[0]! };
}
