import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (body._action === "reorder") {
    // Bulk reorder: [{ id, floorOrder }]
    await Promise.all(
      (body.items as { id: string; floorOrder: number }[]).map((item) =>
        prisma.machine.update({
          where: { id: item.id },
          data: { floorOrder: item.floorOrder },
        })
      )
    );
    return NextResponse.json({ ok: true });
  }

  const machine = await prisma.machine.update({
    where: { id: body.id },
    data: {
      floorZone: body.floorZone ?? null,
      floorOrder: body.floorOrder ?? null,
    },
  });
  return NextResponse.json(machine);
}
