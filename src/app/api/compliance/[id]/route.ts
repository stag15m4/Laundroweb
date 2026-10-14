import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { complianceOwner } from "@/lib/compliance-auth";
import { nextDueDate, statuses, validateDeadline } from "@/lib/compliance";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await complianceOwner(req); if (denied) return denied;
  const { id } = await params;
  let body;
  try {
    body = await req.json();
    if (body.status !== undefined && !(statuses as readonly unknown[]).includes(body.status)) throw new Error("Invalid status");
    if (body.status === undefined) body = validateDeadline(body);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid deadline" }, { status: 400 }); }
  try {
    const result = await prisma.$transaction(async tx => {
      const old = await tx.complianceDeadline.findUnique({ where: { id } });
      if (!old) return null;
      if (old.workflowId && (body.status !== undefined || old.status === "completed")) return { verificationRequired: true };
      if (body.status === undefined) return tx.complianceDeadline.update({ where: { id }, data: body });
      const status = body.status as string;
      const updated = await tx.complianceDeadline.update({ where: { id }, data: { status,
        completedDate: status === "completed" ? old.completedDate ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null } });
      if (status === "completed" && old.status !== "completed" && old.recurrence !== "none") {
        // unique parentId makes retries and reopen/recomplete idempotent.
        await tx.complianceDeadline.upsert({ where: { parentId: id }, update: {}, create: {
          title: old.title, notes: old.notes, deadlineType: old.deadlineType, recurrence: old.recurrence,
          dueDate: nextDueDate(old.dueDate, old.recurrence), parentId: id,
        } });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result && "verificationRequired" in result) return NextResponse.json({ error: "Submit this duty for owner verification." }, { status: 409 });
    return result ? NextResponse.json(result) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return NextResponse.json({ error: "Deadline changed. Refresh and try again." }, { status: 409 });
    throw e;
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await complianceOwner(req); if (denied) return denied;
  const { id } = await params;
  try {
    const removed = await prisma.$transaction(async tx => {
      const old = await tx.complianceDeadline.findUnique({ where: { id }, select: { workflowId: true } });
      if (old?.workflowId) return false;
      await tx.complianceDeadline.deleteMany({ where: { id } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Delegated duties retain their verification history." }, { status: 409 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return NextResponse.json({ error: "Deadline changed. Refresh and try again." }, { status: 409 });
    throw e;
  }
}
