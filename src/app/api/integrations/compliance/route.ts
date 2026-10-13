import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyComplianceToken } from "@/lib/compliance-auth";
export async function GET(req: NextRequest) {
  if (!verifyComplianceToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("tenant_id") !== "laundroweb") return NextResponse.json({ error: "Business not authorized" }, { status: 403 });
  const rows = await prisma.$transaction(tx => tx.complianceDeadline.findMany({ orderBy: { id: "asc" }, take: 10001 }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (rows.length > 10000) return NextResponse.json({ error: "Compliance snapshot too large" }, { status: 413 });
  return NextResponse.json({ version: 1, complete: true, business_id: "laundroweb", deadlines: rows.map(r => ({
    id: r.id, title: r.title, notes: r.notes, due_date: r.dueDate, deadline_type: r.deadlineType,
    status: r.status, completed_date: r.completedDate, recurrence: r.recurrence, updated_at: r.updatedAt.toISOString(),
    source_path: "/dashboard/compliance",
  })) }, { headers: { "Cache-Control": "no-store" } });
}
