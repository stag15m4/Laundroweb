import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateWebhook, phoneUrl } from "@/lib/phone/provider";
import { sidPattern, twiml, xml } from "@/lib/phone/core";
import { outboundActive } from "@/lib/phone/outbound";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const say = (text: string) => `<Say>${xml(text)}</Say>`;
export async function POST(req: NextRequest, context: { params: Promise<{ event: string }> }) {
  const form = await authenticateWebhook(req);
  if (!form) return Response.json({ message: "Invalid telephone provider signature." }, { status: 403 });
  const { event } = await context.params;
  if (!["prompt", "accept", "finished", "status"].includes(event)) return Response.json({ message: "Unknown call event." }, { status: 404 });
  const callSid = form.get("CallSid") || "";
  const id = req.nextUrl.searchParams.get("call") || "";
  const call = await prisma.phoneOutboundCall.findUnique({ where: { id } });
  if (!call || !sidPattern.test(callSid) || form.get("To") !== call.operatorNumber || form.get("From") !== process.env.TWILIO_PHONE_NUMBER || (call.callSid && call.callSid !== callSid)) return Response.json({ message: "Call does not match." }, { status: 403 });
  if (!call.callSid) {
    await prisma.phoneOutboundCall.updateMany({ where: { id, callSid: null }, data: { callSid } });
    if ((await prisma.phoneOutboundCall.findUnique({ where: { id } }))?.callSid !== callSid) return Response.json({ message: "Call does not match." }, { status: 403 });
  }
  const end = (text: string) => twiml(say(text) + "<Hangup/>");
  const endpoint = (name: string) => xml(phoneUrl(`/api/phone/outbound/webhook/${name}?call=${id}`));
  if (event === "status" || event === "finished") {
    const value = form.get(event === "finished" ? "DialCallStatus" : "CallStatus") || "";
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(value)) await prisma.phoneOutboundCall.updateMany({ where: { id, status: { in: outboundActive } }, data: { status: value.replaceAll("-", "_").toUpperCase(), finishedAt: new Date() } });
    return event === "status" ? new Response(null, { status: 204 }) : end("The customer call has ended.");
  }
  const config = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  if (!config?.enabled || call.createdAt.getTime() < Date.now() - 120000 || !outboundActive.includes(call.status)) return end("This call request is no longer available.");
  if (event === "prompt") {
    await prisma.phoneOutboundCall.updateMany({ where: { id, status: { in: ["REQUESTING", "RINGING", "DELIVERY_UNCERTAIN"] } }, data: { status: "AWAITING_CONFIRMATION" } });
    return twiml(`<Gather numDigits="1" timeout="10" action="${endpoint("accept")}" method="POST" actionOnEmptyResult="true">${say(`Clinton Laundry Works callback. Press 1 to call ${call.destination.split("").join(" ")}. The customer will see the business number.`)}</Gather><Hangup/>`);
  }
  if (form.get("Digits") !== "1") {
    await prisma.phoneOutboundCall.updateMany({ where: { id, status: { in: outboundActive } }, data: { status: "DECLINED", finishedAt: new Date() } });
    return end("No customer call was placed.");
  }
  // Atomically consume consent: replayed requests cannot dial a second customer.
  const accepted = await prisma.phoneOutboundCall.updateMany({ where: { id, callSid, status: "AWAITING_CONFIRMATION", acceptedAt: null }, data: { status: "CONNECTING", acceptedAt: new Date() } });
  if (!accepted.count) return end("This call request was already handled.");
  return twiml(`<Dial callerId="${xml(process.env.TWILIO_PHONE_NUMBER!)}" timeout="30" timeLimit="1800" answerOnBridge="true" action="${endpoint("finished")}" method="POST"><Number>${xml(call.destination)}</Number></Dial><Hangup/>`);
}
