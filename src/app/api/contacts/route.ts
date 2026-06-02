import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await prisma.contact.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const contact = await prisma.contact.create({
    data: {
      name: body.name,
      company: body.company || null,
      phone: body.phone || null,
      email: body.email || null,
      role: body.role,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(contact, { status: 201 });
}
