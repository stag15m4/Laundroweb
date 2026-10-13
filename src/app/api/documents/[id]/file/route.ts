import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { contentDisposition } from "@/lib/content-disposition";
import { prisma } from "@/lib/prisma";

// Documents can be anything an owner uploads -- including an HTML file or an
// SVG forwarded from an untrusted party. Serving those inline would run any
// embedded script as this origin, with the viewer's session. Only formats
// with no way to carry active content are safe to render inline; everything
// else is forced to download instead.
const INLINE_SAFE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    select: { fileData: true, mimeType: true, fileName: true },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = INLINE_SAFE_MIME_TYPES.has(document.mimeType) ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(document.fileData), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": contentDisposition(disposition, document.fileName),
      // Not cached: this is an authenticated, deletable document, and a stale
      // cache entry could keep serving it on a shared browser after logout
      // or after the document itself has been deleted.
      "Cache-Control": "private, no-store",
    },
  });
}
