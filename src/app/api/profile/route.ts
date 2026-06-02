import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.currentPassword || body.newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.email) {
    const existing = await prisma.user.findFirst({ where: { email: body.email, NOT: { id: userId } } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    data.email = body.email;
  }
  if (body.newPassword) {
    data.password = await bcrypt.hash(body.newPassword, 12);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json(user);
}
