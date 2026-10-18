import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { protectConfigured, PROTECT_RETENTION_MS } from "@/lib/protect";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const headers = { "Cache-Control": "no-store" };
  if (!session) return NextResponse.json({ message: "Sign in required." }, { status: 401, headers });
  if ((session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ message: "Owner access required." }, { status: 403, headers });
  }
  try {
    const events = await prisma.protectWebhookEvent.findMany({
      where: { receivedAt: { gte: new Date(Date.now() - PROTECT_RETENTION_MS) } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 20,
      select: { id: true, alarmName: true, receivedAt: true, reportedAt: true, payload: true },
    });
    return NextResponse.json({ configured: protectConfigured(), events }, { headers });
  } catch {
    return NextResponse.json({ message: "Could not load Protect test events." }, { status: 503, headers });
  }
}
