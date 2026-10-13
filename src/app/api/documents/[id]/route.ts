import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const document = await prisma.document.update({
    where: { id },
    data: {
      name: body.name,
      category: body.category,
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
  return NextResponse.json(document);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
