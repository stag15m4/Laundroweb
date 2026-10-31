import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RefundRequestStatus } from "@prisma/client";

const STATUSES = Object.values(RefundRequestStatus);

// GET /api/refund-requests
// Dashboard review list -- any logged-in staff can see submitted requests;
// only an OWNER can act on them (see PATCH in [id]/route.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status");
  const where =
    statusParam && STATUSES.includes(statusParam as RefundRequestStatus)
      ? { status: statusParam as RefundRequestStatus }
      : {};

  const requests = await prisma.refundRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { machine: { select: { name: true, type: true } } },
  });
  return NextResponse.json(requests);
}

// POST /api/refund-requests
// Public (no session) -- a customer with no account submits this from the
// /refund page, often from a QR code taped to a machine. machineId is
// optional (they may not know which machine, or pick "not sure"), but
// machineLabel always captures what they selected or typed, independent of
// whether that Machine row still exists later.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const machineLabel = typeof body.machineLabel === "string" ? body.machineLabel.trim() : "";
  const machineId = typeof body.machineId === "string" && body.machineId.trim() ? body.machineId.trim() : null;

  if (!customerName || !description || !machineLabel) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!customerPhone && !customerEmail) {
    return NextResponse.json({ error: "Provide a phone number or email" }, { status: 400 });
  }
  if (customerName.length > 200 || machineLabel.length > 200 || description.length > 4000) {
    return NextResponse.json({ error: "One or more fields are too long" }, { status: 400 });
  }

  const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
  if (Number.isNaN(issueDate.getTime())) {
    return NextResponse.json({ error: "issueDate must be a valid date" }, { status: 400 });
  }

  let amountRequested: number | null = null;
  if (body.amountRequested !== null && body.amountRequested !== undefined && body.amountRequested !== "") {
    const n = Number(body.amountRequested);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "amountRequested must be a non-negative number" }, { status: 400 });
    }
    amountRequested = n;
  }

  if (machineId) {
    const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } });
    if (!machine) return NextResponse.json({ error: "machineId does not exist" }, { status: 400 });
  }

  const request = await prisma.refundRequest.create({
    data: {
      machineId,
      machineLabel,
      customerName,
      customerPhone: customerPhone || null,
      customerEmail: customerEmail || null,
      issueDate,
      description,
      amountRequested,
    },
  });

  return NextResponse.json({ id: request.id }, { status: 201 });
}
