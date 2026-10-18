import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropicConfigured } from "@/lib/anthropic";
import { indexBacklog, isIndexing, markStaleIndexing, startIndexing } from "@/lib/manual-index";

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
  // Manuals uploaded before indexing existed (or before the key was set)
  // get picked up here, so nothing has to be re-uploaded.
  if (anthropicConfigured()) indexBacklog();
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
 *
 * Instead of a file, documentId links a PDF already saved under Documents:
 * its bytes are copied in, so deleting either one leaves the other intact.
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
  const documentId = (formData.get("documentId") as string) || null;
  const file = formData.get("file") as File | null;

  if ((!file && !documentId) || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let source: { fileName: string; mimeType: string; bytes: Buffer };
  if (documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { fileName: true, mimeType: true, fileData: true },
    });
    if (!doc) return NextResponse.json({ error: "That document no longer exists" }, { status: 404 });
    if (doc.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF documents can be used as manuals" }, { status: 400 });
    }
    source = { fileName: doc.fileName, mimeType: doc.mimeType, bytes: Buffer.from(doc.fileData) };
  } else {
    if (file!.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 60 MB)" }, { status: 413 });
    }
    source = { fileName: file!.name, mimeType: file!.type || "application/pdf", bytes: Buffer.from(await file!.arrayBuffer()) };
  }

  const data = {
    name,
    fileName: source.fileName,
    mimeType: source.mimeType,
    fileData: source.bytes,
    fileSize: source.bytes.length,
    indexStatus: "NONE",
    indexError: null,
    pageCount: null,
    indexedPages: 0,
    indexedAt: null,
    // Clearing the run id stops any run still working on the old file.
    indexStartedAt: null,
  };

  const busy = () =>
    NextResponse.json(
      { error: "This manual is still being indexed. Replace it once indexing finishes." },
      { status: 409 }
    );

  let manual;
  if (replaceId) {
    const existing = await prisma.manualDocument.findUnique({ where: { id: replaceId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    if (isIndexing(replaceId)) return busy();
    manual = await prisma.$transaction(async (tx) => {
      await tx.manualEntry.deleteMany({ where: { manualId: replaceId } });
      await tx.manualPage.deleteMany({ where: { manualId: replaceId } });
      return tx.manualDocument.update({ where: { id: replaceId }, data, select: manualSelect });
    });
  } else if (machineId) {
    const current = await prisma.manualDocument.findUnique({ where: { machineId }, select: { id: true } });
    if (current && isIndexing(current.id)) return busy();
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
