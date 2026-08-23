import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/settings?key=foo         → { key, value } or null
// GET /api/settings?prefix=foo_     → [{ key, value }, ...]
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  const prefix = req.nextUrl.searchParams.get("prefix");

  if (key) {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return NextResponse.json(setting);
  }
  if (prefix) {
    const settings = await prisma.setting.findMany({ where: { key: { startsWith: prefix } } });
    return NextResponse.json(settings);
  }
  return NextResponse.json({ error: "key or prefix required" }, { status: 400 });
}

// POST /api/settings  { key, value }  → upsert
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key, value } = await req.json();
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }
  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
  return NextResponse.json(setting);
}
