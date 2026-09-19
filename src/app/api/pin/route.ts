import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDeviceToken, hashDeviceToken } from "@/lib/device";

/** PINs shorter than this are not offered; the lockout is what keeps them safe. */
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;

/** Reports whether the signed-in user has a PIN set. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: { pinHash: true, devices: { select: { id: true, label: true, lastUsedAt: true } } },
  });

  return NextResponse.json({
    hasPin: Boolean(user?.pinHash),
    devices: user?.devices ?? [],
  });
}

/**
 * Sets or replaces the PIN and enrols the calling browser as a trusted device.
 *
 * Requires the account password even though the caller already holds a
 * session: a PIN grants ongoing access, so setting one should cost the same
 * proof as a fresh login rather than riding on a session left open on an
 * unattended machine.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pin, password, label } = await req.json();

  if (typeof pin !== "string" || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be digits only." }, { status: 400 });
  }
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) {
    return NextResponse.json(
      { error: `PIN must be ${MIN_PIN_LENGTH} to ${MAX_PIN_LENGTH} digits.` },
      { status: 400 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (typeof password !== "string" || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 403 });
  }

  const token = generateDeviceToken();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { pinHash: await bcrypt.hash(pin, 12) },
    }),
    prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: hashDeviceToken(token),
        label: typeof label === "string" && label ? label.slice(0, 80) : null,
      },
    }),
  ]);

  // The raw token is returned exactly once, for the browser to store.
  return NextResponse.json({ deviceToken: token });
}

/** Clears the PIN and unenrols every device for this user. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { pinHash: null } }),
    prisma.trustedDevice.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
