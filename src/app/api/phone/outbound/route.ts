import { outboundOriginAllowed } from "@/lib/phone/origin";
import { prisma } from "@/lib/prisma";
import { denied, phoneUser } from "@/lib/phone/access";
import { parseContacts } from "@/lib/phone/core";
import { OutboundError, outboundActive, startOutboundCall } from "@/lib/phone/outbound";
import { providerAuth, providerReady } from "@/lib/phone/provider";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const user = await phoneUser(true);
  if (!user) return denied();
  const config = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  return Response.json({ ready: !!config?.enabled && providerReady(), number: process.env.TWILIO_PHONE_NUMBER || null,
    contacts: config ? parseContacts(config.contacts) : [],
    calls: await prisma.phoneOutboundCall.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, destination: true, operatorNumber: true, status: true, error: true, createdAt: true } }),
  }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const user = await phoneUser(true);
  if (!user) return denied();
  if (!outboundOriginAllowed(req)) return Response.json({ message: "Open the dialer in Laundroweb to place calls." }, { status: 403 });
  try {
    const text = await req.text();
    if (text.length > 2048) throw new OutboundError("Call request is too large.");
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new OutboundError("Invalid call request.");
    const call = await startOutboundCall(user, body);
    return Response.json({ id: call.id, status: call.status, message: call.error || (["REQUESTING", "RINGING", "AWAITING_CONFIRMATION"].includes(call.status) ? "Calling your phone. Answer and press 1 to connect to the customer." : `Call status: ${call.status.toLowerCase().replaceAll("_", " ")}.`) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ message: e instanceof OutboundError ? e.message : "Could not start the call. Retry the same request or check call history." }, { status: e instanceof OutboundError ? e.status : 500 });
  }
}
export async function PATCH(req: Request) {
  const user = await phoneUser(true);
  if (!user) return denied();
  if (!outboundOriginAllowed(req)) return Response.json({ message: "Open Laundroweb to cancel calls." }, { status: 403 });
  try {
    const body = await req.json();
    const call = typeof body.id === "string" ? await prisma.phoneOutboundCall.findFirst({ where: { id: body.id, userId: user.id } }) : null;
    if (!call) return Response.json({ message: "Call not found." }, { status: 404 });
    // Persist intent first: even if cancellation transport fails, a late prompt
    // cannot start a customer call. An already bridged call still needs hangup.
    await prisma.phoneOutboundCall.updateMany({ where: { id: call.id, status: { in: outboundActive } }, data: { status: "CANCELED", finishedAt: new Date() } });
    if (call.callSid && outboundActive.includes(call.status)) {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls/${call.callSid}.json`, {
        method: "POST", headers: { Authorization: providerAuth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Status: "completed" }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("cancel failed");
    }
    return Response.json({ message: "Call canceled. Hang up your iPhone if it is still connected." });
  } catch {
    return Response.json({ message: "Could not confirm disconnection. Hang up your iPhone to end the call." }, { status: 502 });
  }
}
