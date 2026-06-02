import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incidents = await prisma.incident.findMany({
    orderBy: { date: "desc" },
    include: { reportedBy: { select: { name: true } } },
  });
  return NextResponse.json(incidents);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const userId = (session.user as { id?: string }).id;

  const incident = await prisma.incident.create({
    data: {
      date: new Date(body.date),
      description: body.description,
      actionTaken: body.actionTaken || null,
      followUp: body.followUp || null,
      resolved: body.resolved ?? false,
      reportedById: userId ?? null,
    },
    include: { reportedBy: { select: { name: true } } },
  });
  return NextResponse.json(incident, { status: 201 });
}
