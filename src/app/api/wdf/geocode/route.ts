import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { wdfActor, assertWdfOrigin, respond } from "@/lib/wdf-server";
import { WdfError, text } from "@/lib/wdf-pricing";
import { lookupAddress } from "@/lib/wdf-geocoding";
import { signLocation } from "@/lib/wdf-geocode-token";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const calls = new Map<string, { count: number; until: number }>();

export function POST(req: NextRequest) { return respond(async () => {
  const user = await wdfActor();
  assertWdfOrigin(req);
  if (!req.headers.get("content-type")?.includes("application/json")) throw new WdfError("Send JSON.", 415);
  const raw = await req.text();
  if (raw.length > 4000) throw new WdfError("Request is too large.", 413);
  let body;
  try { body = JSON.parse(raw); } catch { throw new WdfError("Invalid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WdfError("Expected an address.");
  const customerId = text(body.customerId, "Customer", 100, true)!;
  const address = text(body.address, "Full street address, city, state and ZIP", 500, true)!;
  if (!await prisma.wdfCustomer.findUnique({ where: { id: customerId }, select: { id: true } })) throw new WdfError("Customer not found.", 404);
  const now = Date.now();
  for (const [id, limit] of calls) if (limit.until <= now) calls.delete(id);
  const limit = calls.get(user.id) ?? { count: 0, until: now + 60000 };
  if (limit.count >= 10) throw new WdfError("Too many address lookups. Try again in a minute.", 429);
  limit.count++; calls.set(user.id, limit);
  const locations = await lookupAddress(address);
  return { matches: locations.map(location => ({ location, token: signLocation(location, user.id, customerId) })),
    message: locations.length ? "Review the address, map pin and county before confirming." : "No match found. Check the full street address, city, state and ZIP. Nothing was saved." };
}); }
