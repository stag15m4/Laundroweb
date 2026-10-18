import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropicConfigured } from "@/lib/anthropic";
import { startIndexing } from "@/lib/manual-index";

/** (Re-)index a manual: read it with Claude and rebuild its pages and entries. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!anthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in Railway." }, { status: 503 });
  }

  const { id } = await params;
  const manual = await prisma.manualDocument.findUnique({ where: { id }, select: { mimeType: true } });
  if (!manual) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (manual.mimeType !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF manuals can be indexed." }, { status: 400 });
  }

  if (!startIndexing(id)) {
    return NextResponse.json({ error: "This manual is already being indexed." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, indexStatus: "INDEXING" });
}
