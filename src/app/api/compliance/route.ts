import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { complianceOwner } from "@/lib/compliance-auth";
import { validateDeadline } from "@/lib/compliance";
export async function GET() {
  const denied = await complianceOwner(); if (denied) return denied;
  return NextResponse.json(await prisma.complianceDeadline.findMany({ orderBy: { dueDate: "asc" } }), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  const denied = await complianceOwner(req); if (denied) return denied;
  let data;
  try { data = validateDeadline(await req.json()); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid deadline" }, { status: 400 }); }
  return NextResponse.json(await prisma.complianceDeadline.create({ data }), { status: 201 });
}
