import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { protectConfigured, PROTECT_RETENTION_MS } from "@/lib/protect";
import { trafficLevel, TRAFFIC_WINDOW_MS } from "@/lib/traffic-activity";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Sign in required." }, { status: 401, headers });
  if ((session.user as { role?: string }).role !== "OWNER") return NextResponse.json({ message: "Owner access required." }, { status: 403, headers });
  try {
    const now = Date.now();
    const [alarms, recent] = await Promise.all([
      prisma.protectWebhookEvent.groupBy({ by: ["alarmName"], where: { receivedAt: { gte: new Date(now - PROTECT_RETENTION_MS) } }, _max: { receivedAt: true } }),
      prisma.protectWebhookEvent.groupBy({ by: ["alarmName"], where: { receivedAt: { gte: new Date(now - TRAFFIC_WINDOW_MS), lte: new Date(now) } }, _count: { _all: true } }),
    ]);
    return NextResponse.json({ configured: protectConfigured(), checkedAt: new Date(now).toISOString(), alarms: alarms.map(a => ({ name: a.alarmName, lastReceivedAt: a._max.receivedAt, level: trafficLevel(recent.find(r => r.alarmName === a.alarmName)?._count._all ?? 0) })) }, { headers });
  } catch {
    return NextResponse.json({ message: "Activity is temporarily unavailable." }, { status: 503, headers });
  }
}
