import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropicConfigured } from "@/lib/anthropic";
import { markStaleIndexing, startIndexing } from "@/lib/manual-index";

const manualSelect = {
  id: true,
  name: true,
  machineType: true,
  machineId: true,
  fileName: true,
  fileSize: true,
  updatedAt: true,
  indexStatus: true,
  indexError: true,
  pageCount: true,
  indexedPages: true,
  indexedAt: true,
  _count: { select: { entries: true } },
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await markStaleIndexing();
  const manuals = await prisma.manualDocument.findMany({
    select: manualSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(manuals, { headers: { "X-Manuals-AI": anthropicConfigured() ? "on" : "off" } });
}

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

/**
 * Upload a manual. With replaceId the file replaces that manual; otherwise a
 * machineId upload replaces that machine's manual (one per machine), and a
 * machineType or general upload adds a new manual, since one machine type can
 * have several (service, programming, parts). PDFs are indexed in the
 * background when an Anthropic key is configured.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const name = ((formData.get("name") as string) || "").trim();
  const machineType = (formData.get("machineType") as string) || null;
  const machineId = (formData.get("machineId") as string) || null;
  const replaceId = (formData.get("replaceId") as string) || null;
  const file = formData.get("file") as File | null;

  if (!file || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 60 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const data = {
    name,
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    fileData: buffer,
    fileSize: buffer.length,
    indexStatus: "NONE",
    indexError: null,
    pageCount: null,
    indexedPages: 0,
    indexedAt: null,
  };

  let manual;
  if (replaceId) {
    const existing = await prisma.manualDocument.findUnique({ where: { id: replaceId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    manual = await prisma.$transaction(async (tx) => {
      await tx.manualEntry.deleteMany({ where: { manualId: replaceId } });
      await tx.manualPage.deleteMany({ where: { manualId: replaceId } });
      return tx.manualDocument.update({ where: { id: replaceId }, data, select: manualSelect });
    });
  } else if (machineId) {
    manual = await prisma.$transaction(async (tx) => {
      const existing = await tx.manualDocument.findUnique({ where: { machineId }, select: { id: true } });
      if (existing) {
        await tx.manualEntry.deleteMany({ where: { manualId: existing.id } });
        await tx.manualPage.deleteMany({ where: { manualId: existing.id } });
        return tx.manualDocument.update({ where: { id: existing.id }, data, select: manualSelect });
      }
      return tx.manualDocument.create({ data: { ...data, machineId, machineType: null }, select: manualSelect });
    });
  } else {
    manual = await prisma.manualDocument.create({
      data: { ...data, machineType, machineId: null },
      select: manualSelect,
    });
  }

  if (anthropicConfigured() && data.mimeType === "application/pdf") {
    startIndexing(manual.id);
    manual = { ...manual, indexStatus: "INDEXING" };
  }

  return NextResponse.json(manual);
}
