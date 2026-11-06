import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseContacts, phonePattern } from "./core";
import { phoneUrl, placeProviderCall, providerReady, TwilioCallError } from "./provider";

export const outboundActive = ["REQUESTING", "RINGING", "AWAITING_CONFIRMATION", "CONNECTING", "DELIVERY_UNCERTAIN"];
export function normalizeDialNumber(value: unknown): string {
  if (typeof value !== "string" || !/^[+\d\s().-]{1,40}$/.test(value)) throw new Error("Enter a ten-digit US/Canada telephone number.");
  const digits = value.replace(/\D/g, "");
  const number = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  if (!phonePattern.test(number) || /^\+1(900|976)/.test(number)) throw new Error("Enter a supported US/Canada telephone number; premium numbers are blocked.");
  return number;
}
export class OutboundError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function startOutboundCall(user: { id: string; name: string }, input: Record<string, unknown>) {
  if (typeof input.requestKey !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestKey)) throw new OutboundError("Reload the dialer and try again.");
  let destination: string, operatorNumber: string;
  try { destination = normalizeDialNumber(input.destination); operatorNumber = normalizeDialNumber(input.operatorNumber); }
  catch (e) { throw new OutboundError((e as Error).message); }
  const config = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  if (!config?.enabled || !providerReady()) throw new OutboundError("Enable the phone line and configure Twilio before calling.", 503);
  const contacts = parseContacts(config.contacts);
  if (!contacts.some(c => c.number === operatorNumber)) throw new OutboundError("Choose a saved on-call contact as your callback phone.");
  if (destination === operatorNumber || destination === process.env.TWILIO_PHONE_NUMBER || operatorNumber === process.env.TWILIO_PHONE_NUMBER) throw new OutboundError("Choose a customer number different from your callback phone and the CLW number.");
  let reserved;
  try {
    reserved = await prisma.$transaction(async tx => {
      const existing = await tx.phoneOutboundCall.findUnique({ where: { requestKey: input.requestKey as string } });
      if (existing) {
        if (existing.userId !== user.id || existing.destination !== destination || existing.operatorNumber !== operatorNumber) throw new OutboundError("This call request does not match. Reopen the dialer.", 409);
        return { call: existing, fresh: false };
      }
      const since = new Date(Date.now() - 60 * 60 * 1000);
      if (await tx.phoneOutboundCall.count({ where: { userId: user.id, createdAt: { gte: since }, status: { in: outboundActive } } })) throw new OutboundError("You already have a call in progress. End or cancel it first.", 409);
      if (await tx.phoneOutboundCall.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60000) } } }) >= 3) throw new OutboundError("Please wait a minute before starting another call.", 429);
      return { call: await tx.phoneOutboundCall.create({ data: { userId: user.id, operatorName: user.name, operatorNumber, destination, requestKey: input.requestKey as string } }), fresh: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof OutboundError) throw e;
    if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(e.code)) throw new OutboundError("Another call request is being processed. Retry this request in a moment.", 409);
    throw e;
  }
  if (!reserved.fresh) return reserved.call;
  const call = reserved.call;
  try {
    const sid = await placeProviderCall({ To: operatorNumber, From: process.env.TWILIO_PHONE_NUMBER!,
      Url: phoneUrl(`/api/phone/outbound/webhook/prompt?call=${call.id}`), Method: "POST",
      StatusCallback: phoneUrl(`/api/phone/outbound/webhook/status?call=${call.id}`), StatusCallbackMethod: "POST",
      Timeout: "25", TimeLimit: "1860",
    });
    // A signed callback may arrive before Twilio's API response.
    await prisma.phoneOutboundCall.updateMany({ where: { id: call.id, callSid: null }, data: { callSid: sid } });
    await prisma.phoneOutboundCall.updateMany({ where: { id: call.id, status: "REQUESTING" }, data: { status: "RINGING" } });
  } catch (e) {
    const rejected = e instanceof TwilioCallError && e.definitelyRejected;
    await prisma.phoneOutboundCall.updateMany({ where: { id: call.id, status: "REQUESTING" }, data: {
      status: rejected ? "REJECTED" : "DELIVERY_UNCERTAIN",
      error: e instanceof TwilioCallError ? e.message.replace("Twilio alert request", "Twilio call request") : "Call delivery is uncertain. Check your phone and call history before trying again.",
      ...(rejected ? { finishedAt: new Date() } : {}),
    } });
  }
  return (await prisma.phoneOutboundCall.findUnique({ where: { id: call.id } }))!;
}
