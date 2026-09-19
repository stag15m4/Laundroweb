import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  accountKey,
  checkLock,
  clearFailures,
  clientIp,
  ipKey,
  recordFailure,
} from "@/lib/throttle";
import { hashDeviceToken } from "@/lib/device";

/**
 * A bcrypt hash of a value nobody knows, compared against when the email does
 * not exist. Without it an unknown address returns noticeably faster than a
 * wrong password, which tells an attacker which accounts are real.
 */
const DUMMY_HASH = "$2a$12$kozdn/Pzn02qAO7/isJxyuHaV.1caDAz.RvEenz50CEPt3XAQE04m";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        pin: { label: "PIN", type: "password" },
        deviceToken: { label: "Device", type: "text" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email) return null;

        const keys = [accountKey(email), ipKey(clientIp(req?.headers))];

        // Locked out: refuse before doing any hashing work. Throwing surfaces
        // the reason to the user; returning null would show a generic failure
        // and leave them retrying against a wall.
        const lock = await checkLock(keys);
        if (lock.locked) {
          throw new Error(
            `LOCKED:Too many failed attempts. Try again in ${lock.retryAfterMinutes} minute${
              lock.retryAfterMinutes === 1 ? "" : "s"
            }.`
          );
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // ── PIN unlock: only valid together with a registered device ───────
        if (credentials?.pin) {
          const token = credentials.deviceToken;
          if (!user?.pinHash || !token) {
            await bcrypt.compare(credentials.pin, DUMMY_HASH);
            await recordFailure(keys);
            return null;
          }

          const device = await prisma.trustedDevice.findUnique({
            where: { tokenHash: hashDeviceToken(token) },
          });

          // The device must belong to the account being unlocked, so a token
          // lifted from one browser cannot unlock somebody else's login.
          if (!device || device.userId !== user.id) {
            await bcrypt.compare(credentials.pin, DUMMY_HASH);
            await recordFailure(keys);
            return null;
          }

          if (!(await bcrypt.compare(credentials.pin, user.pinHash))) {
            await recordFailure(keys);
            return null;
          }

          await prisma.trustedDevice.update({
            where: { id: device.id },
            data: { lastUsedAt: new Date() },
          });
          await clearFailures(keys);
          return { id: user.id, name: user.name, email: user.email, role: user.role };
        }

        // ── Password ───────────────────────────────────────────────────────
        if (!credentials?.password) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user?.password ?? DUMMY_HASH
        );
        if (!user || !valid) {
          await recordFailure(keys);
          return null;
        }

        await clearFailures(keys);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as unknown as { role: string }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role: string; id: string }).role = token.role as string;
        (session.user as { role: string; id: string }).id = token.id as string;
      }
      return session;
    },
  },
};
