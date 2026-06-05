import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const manuals = await prisma.manualDocument.findMany({
    select: {
      id: true,
      name: true,
      machineType: true,
      machineId: true,
      fileName: true,
      fileSize: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(manuals);
}

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const name = formData.get("name") as string;
  const machineType = (formData.get("machineType") as string) || null;
  const machineId = (formData.get("machineId") as string) || null;
  const file = formData.get("file") as File | null;

  if (!file || !name || (!machineType && !machineId)) {
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
  };

  let manual;
  if (machineType) {
    manual = await prisma.manualDocument.upsert({
      where: { machineType },
      create: { ...data, machineType, machineId: null },
      update: data,
      select: { id: true, name: true, machineType: true, machineId: true, fileName: true, fileSize: true, updatedAt: true },
    });
  } else {
    manual = await prisma.manualDocument.upsert({
      where: { machineId: machineId! },
      create: { ...data, machineId: machineId!, machineType: null },
      update: data,
      select: { id: true, name: true, machineType: true, machineId: true, fileName: true, fileSize: true, updatedAt: true },
    });
  }

  return NextResponse.json(manual);
}
