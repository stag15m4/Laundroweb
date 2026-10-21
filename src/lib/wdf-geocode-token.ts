import { createHmac, timingSafeEqual } from "node:crypto";
import { WdfError } from "./wdf-pricing";
import { ServiceLocation } from "./wdf-location";

function signature(payload: string) {
  if (!process.env.NEXTAUTH_SECRET) throw new WdfError("Address confirmation is not configured.", 503);
  return createHmac("sha256", process.env.NEXTAUTH_SECRET).update("wdf-address-v1:" + payload).digest();
}
export function signLocation(location: ServiceLocation, userId: string, customerId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ location, userId, customerId, expires: now + 15 * 60 * 1000 })).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}
export function verifyLocation(token: unknown, userId: string, customerId: string, address: string, now = Date.now()): ServiceLocation {
  const invalid = () => new WdfError("Address match expired or changed. Look up the address again before saving.");
  if (typeof token !== "string" || token.length > 6000) throw invalid();
  const parts = token.split(".");
  if (parts.length !== 2) throw invalid();
  const expected = signature(parts[0]), actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (data.userId !== userId || data.customerId !== customerId || !Number.isFinite(data.expires) || data.expires <= now ||
      data.location?.inputAddress !== address || data.location?.source !== "US_CENSUS") throw invalid();
    return data.location as ServiceLocation;
  } catch { throw invalid(); }
}
