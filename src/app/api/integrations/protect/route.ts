import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseProtectAlarm, protectConfigured, ProtectInputError, PROTECT_RETENTION_MS, readProtectBody, verifyProtectToken } from "@/lib/protect";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!protectConfigured()) return NextResponse.json({ message: "Protect receiver is not configured." }, { status: 503 });
  if (!verifyProtectToken(req.headers.get("x-protect-token"))) {
    return NextResponse.json({ message: "Invalid Protect token." }, { status: 401 });
  }
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ message: "Content-Type must be application/json." }, { status: 415 });
  }
  try {
    const alarm = parseProtectAlarm(await readProtectBody(req));
    // Atomic upsert: simultaneous retries cannot create duplicate deliveries.
    // Retention cleanup shares the transaction so failures remain retryable.
    await prisma.$transaction([
      prisma.protectWebhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - PROTECT_RETENTION_MS) } } }),
      prisma.protectWebhookEvent.upsert({ where: { deliveryHash: alarm.deliveryHash }, create: alarm, update: {} }),
    ]);
    return NextResponse.json({ message: "Protect test event received. Visitor counting is not yet validated." });
  } catch (error) {
    if (error instanceof ProtectInputError) return NextResponse.json({ message: error.message }, { status: error.status });
    // Never log tokens or raw camera payloads.
    console.error("Protect test event could not be stored.");
    return NextResponse.json({ message: "Could not store Protect event. Please retry." }, { status: 503 });
  }
}
