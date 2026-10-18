import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { anthropicConfigured } from "@/lib/anthropic";
import { indexBacklog, markStaleIndexing } from "@/lib/manual-index";
import { prisma } from "@/lib/prisma";

/** Every manual on file, with what it covers and whether it is searchable yet. */
export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  await markStaleIndexing();
  if (anthropicConfigured()) indexBacklog();

  const rows = await prisma.manualDocument.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      machineType: true,
      machine: { select: { name: true } },
      fileName: true,
      fileSize: true,
      pageCount: true,
      indexStatus: true,
      indexError: true,
      indexedAt: true,
      updatedAt: true,
      _count: { select: { entries: true } },
    },
  });

  return NextResponse.json({
    message: `${rows.length} manual${rows.length === 1 ? "" : "s"} on file.`,
    searchEnabled: anthropicConfigured(),
    manuals: rows.map(({ machine, machineType, _count, ...m }) => ({
      ...m,
      covers: machine ? machine.name : machineType ? `all ${machineType.toLowerCase().replace(/_/g, " ")}s` : "general",
      entryCount: _count.entries,
    })),
  });
}
