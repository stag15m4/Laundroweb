import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError } from "@/lib/alfred-write";
import { contentDisposition } from "@/lib/content-disposition";
import { slicePdf } from "@/lib/manual-index";
import { prisma } from "@/lib/prisma";

/** Most pages one request can pull out of a manual. */
const MAX_PAGES = 20;

/**
 * The manual as raw PDF bytes. With ?pages=22,23 (or 22-25) only those pages
 * come back, as a small PDF -- the way to look at the page an answer cited,
 * diagrams included, without fetching a 200-page manual.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const { id } = await params;
  const manual = await prisma.manualDocument.findUnique({
    where: { id },
    select: { fileData: true, mimeType: true, fileName: true },
  });
  if (!manual) {
    return alfredError(404, "not_found", `No manual matches "${id}". Check the id against GET /api/alfred/manuals.`);
  }

  const pagesParam = req.nextUrl.searchParams.get("pages")?.trim();
  if (!pagesParam) {
    return new NextResponse(new Uint8Array(manual.fileData), {
      headers: {
        "Content-Type": manual.mimeType,
        "Content-Disposition": contentDisposition("attachment", manual.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (manual.mimeType !== "application/pdf") {
    return alfredError(400, "not_a_pdf", "Pages can only be pulled from PDF manuals.");
  }
  const pages = new Set<number>();
  for (const part of pagesParam.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return alfredError(400, "invalid_pages", `"${part.trim()}" isn't a page number. Send pages like 22,23 or 22-25.`);
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let p = Math.min(from, to); p <= Math.max(from, to) && pages.size <= MAX_PAGES; p++) pages.add(p);
  }
  if (pages.size > MAX_PAGES) {
    return alfredError(400, "too_many_pages", `Ask for at most ${MAX_PAGES} pages at a time.`);
  }

  const source = await PDFDocument.load(manual.fileData, { ignoreEncryption: true });
  const count = source.getPageCount();
  const wanted = [...pages].sort((a, b) => a - b);
  const outOfRange = wanted.filter((p) => p < 1 || p > count);
  if (outOfRange.length) {
    return alfredError(400, "invalid_pages", `This manual has ${count} pages; page ${outOfRange[0]} doesn't exist.`);
  }

  const bytes = await slicePdf(source, wanted);
  const base = manual.fileName.replace(/\.pdf$/i, "");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition("attachment", `${base} p${wanted.join(",")}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
}
