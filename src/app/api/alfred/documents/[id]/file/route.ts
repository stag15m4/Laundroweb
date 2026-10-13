import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { contentDisposition } from "@/lib/content-disposition";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    select: { fileData: true, mimeType: true, fileName: true },
  });
  if (!document) {
    return NextResponse.json(
      { error: "not_found", message: `No document matches "${id}". Check the id against GET /api/alfred/documents.` },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(document.fileData), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": contentDisposition("attachment", document.fileName),
      // Not cached: this is an authenticated, deletable document.
      "Cache-Control": "private, no-store",
    },
  });
}
