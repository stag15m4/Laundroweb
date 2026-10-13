import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    select: { fileData: true, mimeType: true, fileName: true },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(document.fileData), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${document.fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
