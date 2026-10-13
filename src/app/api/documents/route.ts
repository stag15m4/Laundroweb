import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documents = await prisma.document.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(documents);
}

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const name = formData.get("name") as string;
  const category = (formData.get("category") as string) || "general";
  const file = formData.get("file") as File | null;

  if (!file || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 60 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const userId = (session.user as { id?: string }).id;

  const document = await prisma.document.create({
    data: {
      name,
      category,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileData: buffer,
      fileSize: buffer.length,
      uploadedById: userId ?? null,
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
      uploadedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(document, { status: 201 });
}
