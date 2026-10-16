import { createHash, timingSafeEqual } from "node:crypto";

export const PROTECT_MAX_BYTES = 32 * 1024;
export const PROTECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function protectConfigured(secret = process.env.PROTECT_WEBHOOK_TOKEN) {
  return typeof secret === "string" && secret.length >= 32 && secret.length <= 512;
}

export function verifyProtectToken(header: string | null, secret = process.env.PROTECT_WEBHOOK_TOKEN) {
  if (!protectConfigured(secret) || !header || header.length > 512) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(secret!));
}

export class ProtectInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Enforce the limit while streaming, including requests without Content-Length.
export async function readProtectBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ProtectInputError("A JSON alarm body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PROTECT_MAX_BYTES) {
        await reader.cancel();
        throw new ProtectInputError("Alarm body exceeds 32 KiB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ProtectInputError("Alarm body must be valid JSON."); }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Stable object-key ordering deduplicates identical deliveries, NOT people or
// separate alarms for the same crossing. No unverified direction/count inference.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function parseProtectAlarm(body: unknown) {
  if (!record(body) || !record(body.alarm)) throw new ProtectInputError("Expected a Protect alarm object.");
  const name = body.alarm.name;
  if (typeof name !== "string" || !name.trim() || name.length > 200) {
    throw new ProtectInputError("Alarm name is required (maximum 200 characters).");
  }
  if (typeof body.timestamp !== "number" || !Number.isSafeInteger(body.timestamp) ||
      body.timestamp < 0 || body.timestamp > 8640000000000000) {
    throw new ProtectInputError("Expected a valid timestamp in milliseconds.");
  }
  const serialized = canonical(body);
  if (Buffer.byteLength(serialized) > PROTECT_MAX_BYTES) throw new ProtectInputError("Alarm body exceeds 32 KiB.", 413);
  return {
    deliveryHash: createHash("sha256").update(serialized).digest("hex"),
    alarmName: name.trim(),
    reportedAt: new Date(body.timestamp),
    // Parse again so the result has a JSON-only type accepted by Prisma.
    payload: JSON.parse(serialized),
  };
}
