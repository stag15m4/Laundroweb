
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WdfError, integer, text, date, key, effectivePricing, quote, paymentBalance, allowTransition } from "@/lib/wdf-pricing";

import { readLinen, writeLinen } from "@/lib/linen-server";

import { readAgreements, writeAgreement } from "@/lib/agreement-server";

type Actor = { id: string; name: string; role: string };
const orderInclude = {
  lines: true,
  payments: { orderBy: { createdAt: "asc" as const } },
  audits: { orderBy: { createdAt: "desc" as const } },
};
function audit(actor: Actor, action: string, detail: Prisma.InputJsonValue) {
  return { actorId: actor.id, actorName: actor.name, action, detail };
}
function owner(actor: Actor) {
  if (actor.role !== "OWNER") throw new WdfError("Owner access is required to change pricing or correct payments.", 403);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WdfError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function customerFields(body: Record<string, unknown>) {
  const email = text(body.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WdfError("Enter a valid email address.");
  return {
    name: text(body.name, "Customer name", 200, true)!,
    company: text(body.company, "Company", 200),
    phone: text(body.phone, "Phone", 80),
    email,
    preferences: text(body.preferences, "Laundry preferences", 4000),
    notes: text(body.notes, "Customer notes", 4000),
  };
}
function pricingFields(body: Record<string, unknown>) {
  const customRateCents = body.customRateCents == null ? null : integer(body.customRateCents, "Customer rate", 1, 10000);
  const customMinimumCents = body.customMinimumCents == null ? null : integer(body.customMinimumCents, "Customer minimum", 0, 1000000);
  const pricingExpiresAt = date(body.pricingExpiresAt, "Pricing expiration");
  const pricingReason = text(body.pricingReason, "Pricing reason", 2000);
  if ((customRateCents !== null || customMinimumCents !== null) && !pricingReason)
    throw new WdfError("Record a reason for negotiated pricing.");
  return { customRateCents, customMinimumCents, pricingExpiresAt, pricingReason };
}
function present<T extends { totalCents: number; payments: { amountCents: number; voidedAt: unknown }[] }>(order: T) {
  const paidCents = paymentBalance(order.payments);
  const balanceCents = order.totalCents - paidCents;
  return { ...order, paidCents, balanceCents, paymentStatus: paidCents === 0 ? "UNPAID" : balanceCents === 0 ? "PAID" : "PARTIAL" };
}
async function actor() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new WdfError("Please sign in.", 401);
  // Recheck current permissions rather than trusting a stale JWT role.
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  if (!user) throw new WdfError("Please sign in.", 401);
  return user;
}
export { actor as wdfActor };
export function assertWdfOrigin(req: NextRequest) {
  const allowed = new Set([req.nextUrl.origin, ...(process.env.NEXTAUTH_URL ? [new URL(process.env.NEXTAUTH_URL).origin] : [])]);
  if (!req.headers.get("origin") || !allowed.has(req.headers.get("origin")!)) throw new WdfError("Request origin is not allowed.", 403);
}
export async function read(req: NextRequest) {
  const user = await actor();
  const p = req.nextUrl.searchParams;
  if (p.get("linen") === "1") return { ...await readLinen(p.get("customerId")), isOwner: user.role === "OWNER" };
  if (p.get("agreements") === "1") return { ...await readAgreements(p.get("customerId")), isOwner: user.role === "OWNER" };
  const orderId = p.get("orderId");
  if (orderId) {
    const order = await prisma.wdfOrder.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new WdfError("Order not found.", 404);
    return { order: present(order), isOwner: user.role === "OWNER" };
  }
  const customerId = p.get("customerId");
  if (customerId) {
    const customer = await prisma.wdfCustomer.findUnique({ where: { id: customerId }, include: { audits: { orderBy: { createdAt: "desc" }, take: 100 } } });
    if (!customer) throw new WdfError("Customer not found.", 404);
    const where = { customerId, status: { not: "CANCELLED" } };
    const [orders, totals, payments] = await Promise.all([
      prisma.wdfOrder.findMany({ where: { customerId }, include: orderInclude, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.wdfOrder.aggregate({ where, _sum: { totalCents: true, laundryCents: true, weightHundredths: true, laborMinutes: true }, _count: true }),
      prisma.wdfPayment.aggregate({ where: { order: where, voidedAt: null }, _sum: { amountCents: true } }),
    ]);
    return { customer: { ...customer, ...effectivePricing(customer) }, orders: orders.map(present), totals: {
      orders: totals._count, totalCents: totals._sum.totalCents ?? 0,
      pounds: (totals._sum.weightHundredths ?? 0) / 100,
      averageRateCents: totals._sum.weightHundredths ? Math.round((totals._sum.laundryCents ?? 0) * 100 / totals._sum.weightHundredths) : null,
      laborMinutes: totals._sum.laborMinutes ?? 0, paidCents: payments._sum.amountCents ?? 0,
    }};
  }
  const search = (p.get("q") ?? "").trim().slice(0, 100);
  const customers = await prisma.wdfCustomer.findMany({
    where: search ? { OR: ["name", "company", "phone", "email"].map(field => ({ [field]: { contains: search, mode: "insensitive" } })) } : {},
    orderBy: { name: "asc" }, take: 100, include: { _count: { select: { orders: true } } },
  });
  const orders = await prisma.wdfOrder.findMany({
    where: search ? { OR: [{ customerName: { contains: search, mode: "insensitive" } }, { customerPhone: { contains: search, mode: "insensitive" } },
      ...( /^\d+$/.test(search) && Number(search) <= 2147483647 ? [{ number: Number(search) }] : [])] } : {},
    include: orderInclude, orderBy: { createdAt: "desc" }, take: 100,
  });
  const where = { status: { not: "CANCELLED" } };
  const [totals, payments] = await Promise.all([
    prisma.wdfOrder.aggregate({ where, _sum: { totalCents: true, weightHundredths: true, laborMinutes: true }, _count: true }),
    prisma.wdfPayment.aggregate({ where: { order: where, voidedAt: null }, _sum: { amountCents: true } }),
  ]);
  return { customers: customers.map(c => ({ ...c, ...effectivePricing(c) })), orders: orders.map(present), isOwner: user.role === "OWNER", summary: {
    orders: totals._count, totalCents: totals._sum.totalCents ?? 0,
    paidCents: payments._sum.amountCents ?? 0,
    balanceCents: (totals._sum.totalCents ?? 0) - (payments._sum.amountCents ?? 0),
    pounds: (totals._sum.weightHundredths ?? 0) / 100, laborMinutes: totals._sum.laborMinutes ?? 0,
  }};
}

export async function write(req: NextRequest) {
  const user = await actor();
  assertWdfOrigin(req);
  if (!req.headers.get("content-type")?.includes("application/json")) throw new WdfError("Send JSON.", 415);
  const raw = await req.text();
  if (raw.length > 64000) throw new WdfError("Request is too large.", 413);
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(raw)); } catch (e) { if (e instanceof WdfError) throw e; throw new WdfError("Invalid JSON."); }
  const action = text(body.action, "Action", 60, true);
  const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        if (action?.startsWith("agreement.")) return writeAgreement(tx, user, body, digest);
        if (action?.startsWith("linen.")) return writeLinen(tx, user, body, digest);
        if (action === "customer.create") {
          const fields = customerFields(body);
          if (user.role !== "OWNER" && ["customRateCents", "customMinimumCents", "pricingExpiresAt", "pricingReason"].some(k => body[k] != null && body[k] !== ""))
            owner(user);
          const pricing = user.role === "OWNER" ? pricingFields(body) : { customRateCents: null, customMinimumCents: null, pricingExpiresAt: null, pricingReason: null };
          const customer = await tx.wdfCustomer.create({ data: { ...fields, ...pricing, audits: { create: audit(user, "CUSTOMER_CREATED", { ...fields, ...pricing, pricingExpiresAt: pricing.pricingExpiresAt?.toISOString() ?? null }) } } });
          return { customer };
        }
        if (action === "customer.update") {
          const id = text(body.id, "Customer", 100, true)!;
          const current = await tx.wdfCustomer.findUnique({ where: { id } });
          if (!current) throw new WdfError("Customer not found.", 404);
          if (current.version !== integer(body.version, "Version")) throw new WdfError("Customer changed. Reload before saving.", 409);
          const fields = customerFields(body);
          const hasPricing = ["customRateCents", "customMinimumCents", "pricingExpiresAt", "pricingReason", "active"].some(k => k in body);
          if (hasPricing) owner(user);
          const pricing = hasPricing ? pricingFields(body) : {};
          if ("active" in body && typeof body.active !== "boolean") throw new WdfError("Invalid active flag.");
          const customer = await tx.wdfCustomer.update({ where: { id }, data: { ...fields, ...pricing, ...(typeof body.active === "boolean" ? { active: body.active } : {}), version: { increment: 1 },
            audits: { create: audit(user, "CUSTOMER_UPDATED", JSON.parse(JSON.stringify({ before: current, after: { ...fields, ...pricing, active: body.active ?? current.active } }))) } } });
          return { customer };
        }
        if (action === "order.create") {
          const requestKey = key(body.requestKey);
          const existing = await tx.wdfOrder.findUnique({ where: { requestKey }, include: orderInclude });
          if (existing) {
            if (existing.requestDigest !== digest) throw new WdfError("Request key already used for different order details.", 409);
            return { order: present(existing) };
          }
          const customerId = text(body.customerId, "Customer", 100, true)!;
          const customer = await tx.wdfCustomer.findUnique({ where: { id: customerId } });
          if (!customer || !customer.active) throw new WdfError("Select an active customer.");
          const pricing = effectivePricing(customer);
          let pricingReason: string | null = customer.pricingReason;
          if ("rateCents" in body || "minimumCents" in body) {
            owner(user);
            pricing.rateCents = integer(body.rateCents, "Order rate", 1, 10000);
            pricing.minimumCents = integer(body.minimumCents, "Order minimum", 0, 1000000);
            pricing.pricingSource = "OVERRIDE";
            pricingReason = text(body.pricingReason, "Override reason", 2000, true);
          }
          const weightHundredths = integer(body.weightHundredths, "Dry weight", 0, 1000000);
          if (!Array.isArray(body.lines) || body.lines.length > 30) throw new WdfError("Invalid specialty items.");
          const lines = body.lines.map(item => {
            const v = record(item);
            return { description: text(v.description, "Item description", 200, true)!, quantity: integer(v.quantity, "Quantity", 1, 1000), unitCents: integer(v.unitCents, "Item price", 1, 1000000) };
          });
          // Specialty prices are entered by the owner until a fixed item catalog is configured.
          if (lines.length) owner(user);
          const result = quote(weightHundredths, pricing.rateCents, pricing.minimumCents, lines);
          const order = await tx.wdfOrder.create({ data: {
            requestKey, requestDigest: digest, customerId, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
            preferences: customer.preferences, ...pricing, pricingReason, weightHundredths,
            laundryCents: result.laundryCents, totalCents: result.totalCents,
            dueAt: date(body.dueAt, "Promised pickup"), notes: text(body.notes, "Order notes", 4000),
            createdById: user.id, createdByName: user.name,
            lines: { create: lines.map((line, i) => ({ ...line, totalCents: result.lineTotals[i] })) },
            audits: { create: audit(user, "ORDER_CREATED", { ...pricing, pricingReason, totalCents: result.totalCents, weightHundredths }) },
          }, include: orderInclude });
          return { order: present(order) };
        }
        const id = text(body.orderId, "Order", 100, true)!;
        const order = await tx.wdfOrder.findUnique({ where: { id }, include: orderInclude });
        if (!order) throw new WdfError("Order not found.", 404);
        const paid = paymentBalance(order.payments);
        if (action === "order.update") {
          if (order.version !== integer(body.version, "Version")) throw new WdfError("Order changed. Reload before saving.", 409);
          const status = text(body.status, "Status", 30, true)!;
          allowTransition(order.status, status, user.role === "OWNER", paid);
          if (order.status === "CANCELLED") throw new WdfError("Cancelled orders are read-only.", 409);
          const reason = status === "CANCELLED" ? text(body.reason, "Cancellation reason", 2000, true) : null;
          const data = { status, notes: text(body.notes, "Notes", 4000), machineNotes: text(body.machineNotes, "Machines used", 2000),
            laborMinutes: integer(body.laborMinutes, "Labor minutes", 0, 100000), dueAt: date(body.dueAt, "Promised pickup") };
          const updated = await tx.wdfOrder.update({ where: { id }, data: { ...data, version: { increment: 1 },
            audits: { create: audit(user, "ORDER_UPDATED", JSON.parse(JSON.stringify({ before: { status: order.status, notes: order.notes, machineNotes: order.machineNotes, laborMinutes: order.laborMinutes, dueAt: order.dueAt }, after: data, reason }))) },
          }, include: orderInclude });
          return { order: present(updated) };
        }
        if (action === "payment.create") {
          const requestKey = key(body.requestKey);
          const existing = await tx.wdfPayment.findUnique({ where: { requestKey } });
          if (existing) {
            if (existing.requestDigest !== digest || existing.orderId !== id) throw new WdfError("Request key already used for another payment.", 409);
            return { order: present(order) };
          }
          if (order.status === "CANCELLED") throw new WdfError("Cancelled orders cannot take payments.", 409);
          const kind = body.kind === "REFUND" ? "REFUND" : body.kind === "PAYMENT" ? "PAYMENT" : null;
          if (!kind) throw new WdfError("Invalid payment type.");
          if (kind === "REFUND") owner(user);
          const method = text(body.method, "Payment method", 20, true)!;
          if (!["CASH", "CHECK", "CARD"].includes(method)) throw new WdfError("Invalid payment method.");
          const amount = integer(body.amountCents, "Payment amount", 1, 100000000);
          const reference = text(body.reference, "Transaction reference / check number", 200, method === "CHECK");
          const reason = text(body.reason, "Reason", 2000, kind === "REFUND");
          if (kind === "PAYMENT" && amount > order.totalCents - paid) throw new WdfError("Payment exceeds the outstanding balance.", 409);
          if (kind === "REFUND" && amount > paid) throw new WdfError("Refund exceeds recorded payments.", 409);
          if (method === "CARD" && body.confirmed !== true) throw new WdfError("Confirm the bank app reports a successful transaction.");
          const payment = await tx.wdfPayment.create({ data: {
            orderId: id, requestKey, requestDigest: digest, method, kind, amountCents: kind === "REFUND" ? -amount : amount,
            reference, reason, recordedById: user.id, recordedByName: user.name,
          } });
          const updated = await tx.wdfOrder.update({ where: { id }, data: { version: { increment: 1 },
            audits: { create: audit(user, kind === "REFUND" ? "REFUND_RECORDED" : "PAYMENT_RECORDED", { paymentId: payment.id, method, amountCents: payment.amountCents, reference, reason }) },
          }, include: orderInclude });
          return { order: present(updated) };
        }
        if (action === "payment.void") {
          owner(user);
          const paymentId = text(body.paymentId, "Payment", 100, true)!;
          const payment = order.payments.find(p => p.id === paymentId);
          if (!payment) throw new WdfError("Payment not found.", 404);
          if (payment.voidedAt) throw new WdfError("Payment is already reversed.", 409);
          if (order.status === "CANCELLED") throw new WdfError("Cancelled orders are read-only.", 409);
          const newPaid = paid - payment.amountCents;
          if (newPaid < 0 || newPaid > order.totalCents) throw new WdfError("Reverse related entries first to preserve the payment balance.", 409);
          const reason = text(body.reason, "Correction / returned check reason", 2000, true)!;
          await tx.wdfPayment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
          const updated = await tx.wdfOrder.update({ where: { id }, data: { version: { increment: 1 },
            audits: { create: audit(user, "PAYMENT_REVERSED", { paymentId, reason }) },
          }, include: orderInclude });
          return { order: present(updated) };
        }
        throw new WdfError("Unknown action.");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(e.code)) {
        if (attempt < 2) continue;
        throw new WdfError("Another save is in progress. Reload and retry.", 409);
      }
      throw e;
    }
  }
  throw new WdfError("Could not save.", 409);
}

export async function respond(operation: () => Promise<unknown>) {
  try { return NextResponse.json(await operation(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof WdfError) return NextResponse.json({ message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("WDF request failed", error);
    return NextResponse.json({ message: "Could not complete the request. Please retry." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
