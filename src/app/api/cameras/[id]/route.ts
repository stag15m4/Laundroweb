import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function validateUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "A link is required." };
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "The link must start with https://." };
  }
  return { ok: true, url: trimmed };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  // Only fields actually sent are touched, so a partial update can't blank
  // the rest of the record.
  const data: { name?: string; url?: string; notes?: string | null; sortOrder?: number } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    data.name = name;
  }
  if (body.url !== undefined) {
    const urlCheck = validateUrl(body.url);
    if (!urlCheck.ok) return NextResponse.json({ error: urlCheck.error }, { status: 400 });
    data.url = urlCheck.url;
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

  const camera = await prisma.camera.update({ where: { id }, data });
  return NextResponse.json(camera);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.camera.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
