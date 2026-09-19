import { createHash, randomBytes } from "crypto";

/**
 * Device tokens identify a browser that has been enrolled for PIN unlock.
 *
 * The raw token is generated server-side, handed to the browser once and kept
 * in its localStorage. Only the SHA-256 hash is stored, so someone reading the
 * database cannot replay a row as a registered device. SHA-256 rather than
 * bcrypt is deliberate: the token is 256 bits of randomness, so it needs no
 * stretching, and the lookup has to be an indexed exact match.
 */

export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
