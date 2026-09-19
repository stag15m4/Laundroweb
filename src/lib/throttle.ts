import { prisma } from "@/lib/prisma";

/**
 * Login throttling.
 *
 * Attempts are counted in the database rather than in memory: Railway restarts
 * the container on every deploy, and an in-memory counter would hand an
 * attacker a clean slate each time. It also keeps the count correct if the
 * service ever runs more than one instance.
 *
 * Two keys are tracked per attempt. The account key stops a brute force
 * against one login; the IP key stops the same attacker spraying a short PIN
 * or a common password across several accounts.
 */

/** Failures allowed before a key is locked. */
export const MAX_FAILURES = 5;

/** How long a key stays locked once it trips. */
export const LOCKOUT_MINUTES = 15;

export function accountKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}

/** Either shape of headers we can be handed. */
type HeaderBag = Headers | Record<string, string | string[] | undefined>;

/**
 * Pulls the client IP from the proxy headers Railway sets.
 *
 * NextAuth hands authorize() a plain object of headers, while route handlers
 * pass a real Headers instance. Both are supported here: assuming the Headers
 * interface and calling .get() on the plain object throws, which inside
 * authorize() fails the whole login rather than just the lookup.
 *
 * Falls back to a constant so a missing header degrades into one shared bucket
 * rather than silently disabling IP throttling altogether.
 */
export function clientIp(headers: HeaderBag | undefined): string {
  if (!headers) return "unknown";

  const read = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name) ?? undefined;
    }
    const value = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const forwarded = read("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return read("x-real-ip") ?? "unknown";
}

export type LockState = { locked: boolean; retryAfterMinutes: number };

/** Reports whether any of the supplied keys is currently locked. */
export async function checkLock(keys: string[]): Promise<LockState> {
  const now = new Date();
  const rows = await prisma.loginThrottle.findMany({
    where: { key: { in: keys }, lockedUntil: { gt: now } },
    orderBy: { lockedUntil: "desc" },
  });

  const soonest = rows[0];
  if (!soonest?.lockedUntil) return { locked: false, retryAfterMinutes: 0 };

  const minutes = Math.max(
    1,
    Math.ceil((soonest.lockedUntil.getTime() - now.getTime()) / 60000)
  );
  return { locked: true, retryAfterMinutes: minutes };
}

/** Counts a failed attempt against every key, locking any that trip. */
export async function recordFailure(keys: string[]): Promise<void> {
  const now = new Date();

  await Promise.all(
    keys.map(async (key) => {
      const existing = await prisma.loginThrottle.findUnique({ where: { key } });

      // A lock that has already expired starts the count over rather than
      // leaving the key one failure away from locking again forever.
      const expired = existing?.lockedUntil && existing.lockedUntil <= now;
      const failures = existing && !expired ? existing.failures + 1 : 1;
      const lockedUntil =
        failures >= MAX_FAILURES
          ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
          : null;

      await prisma.loginThrottle.upsert({
        where: { key },
        create: { key, failures, lockedUntil },
        update: { failures, lockedUntil },
      });
    })
  );
}

/** Clears the counters for these keys after a successful login. */
export async function clearFailures(keys: string[]): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key: { in: keys } } });
}
