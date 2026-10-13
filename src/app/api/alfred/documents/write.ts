import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alfredError } from "@/lib/alfred-write";

const CATEGORIES = ["general", "compliance", "insurance", "legal", "vendor", "financial"];

// Matches the cap on the human-facing upload endpoint (src/app/api/documents).
const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

export type DocumentUploadPayload = {
  name: string;
  category: string;
  fileName: string;
  mimeType: string;
  /** Kept as base64 in the stored proposal; decoded again at confirm time. */
  fileBase64: string;
};

export type Validated =
  | { ok: true; payload: DocumentUploadPayload; summary: string }
  | { ok: false; response: NextResponse };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Turns a propose body into a resolved, writable document -- or into the
 * reason it cannot be saved. Nothing here touches the real tables.
 */
export async function validateDocumentUpload(body: Record<string, unknown>): Promise<Validated> {
  // ── Name ───────────────────────────────────────────────────────────────
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return {
      ok: false,
      response: alfredError(400, "missing_name", "No name was supplied for this document."),
    };
  }

  // ── Category (optional, defaults to general) ────────────────────────────
  const rawCategory = typeof body.category === "string" ? body.category.trim().toLowerCase() : "general";
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : "general";

  // ── File ───────────────────────────────────────────────────────────────
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : name;
  const mimeType =
    typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType.trim() : "application/octet-stream";

  const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
  if (!fileBase64) {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_file",
        "No fileBase64 was supplied. Send the document's contents as a base64-encoded string."
      ),
    };
  }

  // Buffer.from(..., "base64") is lenient: it silently drops characters
  // outside the base64 alphabet instead of throwing, so a plain try/catch
  // around it never actually catches malformed input -- it would decode
  // garbage bytes from something like "not base64" without complaint. Line
  // wrapping is tolerated (a common way large base64 is sent), but the
  // remaining content must be valid base64 with correct padding.
  const normalized = fileBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return {
      ok: false,
      response: alfredError(400, "invalid_file", "fileBase64 is not valid base64. Make sure it is the raw base64 encoding of the file, with no other wrapping."),
    };
  }

  const size = Buffer.from(normalized, "base64").length;
  if (size === 0) {
    return { ok: false, response: alfredError(400, "invalid_file", "The decoded file was empty.") };
  }
  if (size > MAX_BYTES) {
    return {
      ok: false,
      response: alfredError(413, "file_too_large", `The file is ${formatSize(size)}; the limit is 60 MB.`),
    };
  }

  // ── Summary, written for a person to approve ────────────────────────────
  const summary = `Save "${name}" (${category}) as a ${formatSize(size)} document (${fileName}).`;

  return {
    ok: true,
    summary,
    payload: { name, category, fileName, mimeType, fileBase64: normalized },
  };
}

/** Performs the write described by a confirmed proposal. */
export async function writeDocumentUpload(payload: DocumentUploadPayload) {
  const buffer = Buffer.from(payload.fileBase64, "base64");
  return prisma.document.create({
    data: {
      name: payload.name,
      category: payload.category,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileData: buffer,
      fileSize: buffer.length,
      uploadedById: null,
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
    },
  });
}
