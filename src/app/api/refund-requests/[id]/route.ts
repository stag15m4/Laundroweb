import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RefundRequestStatus } from "@prisma/client";

const STATUSES = Object.values(RefundRequestStatus);

// PATCH /api/refund-requests/[id]
// Deciding whether to actually refund someone's money is an owner call, same
// as approving a cash deposit -- staff can see the queue (GET on the parent
// route) but not act on it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const status = body.status;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const reviewNotes = typeof body.reviewNotes === "string" && body.reviewNotes.trim() ? body.reviewNotes.trim() : null;

  const existing = await prisma.refundRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reviewer = (session.user as { name?: string | null; email?: string | null }).name ?? session.user?.email ?? null;

  const updated = await prisma.refundRequest.update({
    where: { id },
    data: {
      status,
      reviewNotes,
      reviewedBy: reviewer,
      reviewedAt: new Date(),
    },
  });
  return NextResponse.json(updated);
}
