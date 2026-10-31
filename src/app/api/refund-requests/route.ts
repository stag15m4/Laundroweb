import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RefundRequestStatus } from "@prisma/client";
import { corsHeaders } from "@/lib/public-cors";
import { verifyTurnstile } from "@/lib/turnstile";

const STATUSES = Object.values(RefundRequestStatus);

// GET /api/refund-requests
// Dashboard review list -- any logged-in staff can see submitted requests;
// only an OWNER can act on them (see PATCH in [id]/route.ts). Called only
// from the Laundroweb dashboard itself, so no CORS headers here.
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
  });
  return NextResponse.json(requests);
}

// OPTIONS /api/refund-requests
// CORS preflight for the public site's cross-origin POST (a JSON POST body
// triggers one).
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

// POST /api/refund-requests
// Public (no session) -- a customer with no account submits this from the
// clinton-laundry-works marketing site's /refund/ page, cross-origin.
// machineLabel is whatever unit number they typed in, not a foreign key:
// the public site has no database to look one up against.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });

  const forwardedFor = req.headers.get("x-forwarded-for");
  const remoteIp = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;
  const isHuman = await verifyTurnstile(body.turnstileToken, remoteIp);
  if (!isHuman) {
    return NextResponse.json({ error: "Human verification failed. Please try again." }, { status: 400, headers });
  }

  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  const customerAddress = typeof body.customerAddress === "string" ? body.customerAddress.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const machineLabel = typeof body.machineLabel === "string" ? body.machineLabel.trim() : "";

  if (!customerName || !customerPhone || !customerAddress || !description || !machineLabel) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers });
  }
  if (body.certifiedAccurate !== true) {
    return NextResponse.json({ error: "You must certify the information is accurate" }, { status: 400, headers });
  }
  if (
    customerName.length > 200 ||
    machineLabel.length > 200 ||
    customerAddress.length > 500 ||
    description.length > 4000
  ) {
    return NextResponse.json({ error: "One or more fields are too long" }, { status: 400, headers });
  }

  const issueDate = body.issueDate ? new Date(body.issueDate) : null;
  if (!issueDate || Number.isNaN(issueDate.getTime())) {
    return NextResponse.json({ error: "issueDate must be a valid date/time" }, { status: 400, headers });
  }

  const transactionAmount = Number(body.transactionAmount);
  if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
    return NextResponse.json({ error: "transactionAmount must be a positive number" }, { status: 400, headers });
  }
  const amountRequested = Number(body.amountRequested);
  if (!Number.isFinite(amountRequested) || amountRequested <= 0) {
    return NextResponse.json({ error: "amountRequested must be a positive number" }, { status: 400, headers });
  }

  const request = await prisma.refundRequest.create({
    data: {
      machineLabel,
      customerName,
      customerPhone,
      customerEmail: customerEmail || null,
      customerAddress,
      issueDate,
      description,
      transactionAmount,
      amountRequested,
      certifiedAccurate: true,
    },
  });

  return NextResponse.json({ id: request.id }, { status: 201, headers });
}
