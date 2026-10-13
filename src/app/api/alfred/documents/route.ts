import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError, consumeProposal, createProposal, PROPOSAL_TTL_SECONDS } from "@/lib/alfred-write";
import { validateDocumentUpload, writeDocumentUpload, type DocumentUploadPayload } from "./write";
import { prisma } from "@/lib/prisma";

/** Ties a confirmation token to this endpoint. */
const RESOURCE = "documents";

export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const p = req.nextUrl.searchParams;
  const category = p.get("category");
  const q = p.get("q"); // free-text search over the document name

  const documents = await prisma.document.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true,
      name: true,
      category: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(documents);
}

// ── Write: propose, then confirm ───────────────────────────────────────────

/**
 * One endpoint, two steps.
 *
 * A body without `confirmationToken` is a proposal: it is validated in full,
 * nothing is written, and a token comes back with a summary for a human to
 * approve. A body containing only `confirmationToken` performs that write.
 * The assistant therefore cannot save a document unilaterally.
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

    const document = await writeDocumentUpload(claim.payload as DocumentUploadPayload);
    return NextResponse.json({
      status: "confirmed",
      summary: claim.summary,
      documentId: document.id,
      record: document,
    });
  }

  // ── Propose ─────────────────────────────────────────────────────────────
  const validated = await validateDocumentUpload(body);
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
    details: {
      name: validated.payload.name,
      category: validated.payload.category,
      fileName: validated.payload.fileName,
      mimeType: validated.payload.mimeType,
      fileSizeBytes: Buffer.from(validated.payload.fileBase64, "base64").length,
    },
  });
}
