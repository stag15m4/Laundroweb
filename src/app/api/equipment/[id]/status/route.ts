import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { MachineStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = Object.values(MachineStatus) as string[];

/**
 * Changes a machine's status, optionally recording a note in the same step.
 *
 * Deliberately separate from the full machine PATCH, which is owner-only:
 * noticing a dead dryer and marking it out of order is ordinary floor work,
 * not administration, so any signed-in user may do it. Editing a machine's
 * model, serial or install date stays restricted.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status, note } = await req.json();

  if (typeof status !== "string" || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const authorId = (session.user as { id?: string }).id ?? null;
  const trimmed = typeof note === "string" ? note.trim() : "";

  // One transaction so a machine is never left marked out of order with its
  // explanation missing.
  const [machine] = await prisma.$transaction([
    prisma.machine.update({ where: { id }, data: { status: status as MachineStatus } }),
    ...(trimmed
      ? [
          prisma.note.create({
            data: {
              content: trimmed,
              category: "maintenance",
              machineId: id,
              authorId,
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json(machine);
}
