
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WdfError, integer, text, date, key } from "@/lib/wdf-pricing";
import { applyMovement, estimateTowels, serviceWeek, Movement } from "@/lib/linen";

type Actor = { id: string; name: string; role: string };
function requireOwner(user: Actor) {
  if (user.role !== "OWNER") throw new WdfError("Only an owner can change rental agreements, reconcile inventory or write off losses.", 403);
}
const sums = { towelsOut: true, towelsIn: true, towelsLost: true, bagsOut: true, bagsIn: true, bagsLost: true, towelAdjustment: true, bagAdjustment: true } as const;
async function custody(db: Prisma.TransactionClient, planId: string) {
  const a = await db.wdfLinenExchange.aggregate({ where: { planId }, _sum: sums });
  const s = a._sum;
  return { towels: (s.towelsOut ?? 0) - (s.towelsIn ?? 0) - (s.towelsLost ?? 0) + (s.towelAdjustment ?? 0),
    bags: (s.bagsOut ?? 0) - (s.bagsIn ?? 0) - (s.bagsLost ?? 0) + (s.bagAdjustment ?? 0) };
}
function audit(user: Actor, customerId: string, action: string, detail: unknown) {
  return { customerId, actorId: user.id, actorName: user.name, action, detail: JSON.parse(JSON.stringify(detail)) as Prisma.InputJsonValue };
}
export async function readLinen(customerId: string | null) {
  if (!customerId) {
    const plans = await prisma.wdfLinenPlan.findMany({ include: { customer: { select: { name: true, phone: true, active: true } }, exchanges: { orderBy: { occurredAt: "desc" }, take: 1 } }, orderBy: { customer: { name: "asc" } } });
    const totals = await prisma.wdfLinenExchange.groupBy({ by: ["planId"], _sum: sums });
    const inventory = new Map(totals.map(s => [s.planId, {
      towels: (s._sum.towelsOut ?? 0) - (s._sum.towelsIn ?? 0) - (s._sum.towelsLost ?? 0) + (s._sum.towelAdjustment ?? 0),
      bags: (s._sum.bagsOut ?? 0) - (s._sum.bagsIn ?? 0) - (s._sum.bagsLost ?? 0) + (s._sum.bagAdjustment ?? 0),
    }]));
    return { plans: plans.map(p => ({ ...p, balance: inventory.get(p.id) ?? { towels: 0, bags: 0 } })) };
  }
  // Read the plan and its ledger in one snapshot so the displayed version and
  // balances can safely be used for optimistic concurrency on the next write.
  return prisma.$transaction(async tx => {
    const customer = await tx.wdfCustomer.findUnique({ where: { id: customerId }, select: { id: true, name: true, active: true } });
    if (!customer) throw new WdfError("Customer not found.", 404);
    const plan = await tx.wdfLinenPlan.findUnique({ where: { customerId }, include: {
      exchanges: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 100 },
      charges: { orderBy: { weekStart: "desc" }, take: 100, include: { order: { select: { id: true, number: true, status: true, totalCents: true } } } },
    } });
    return { customer, plan, balance: plan ? await custody(tx, plan.id) : { towels: 0, bags: 0 } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function writeLinen(tx: Prisma.TransactionClient, user: Actor, body: Record<string, unknown>, digest: string) {
  const action = body.action;
  const customerId = text(body.customerId, "Customer", 100, true)!;
  const customer = await tx.wdfCustomer.findUnique({ where: { id: customerId } });
  if (!customer) throw new WdfError("Customer not found.", 404);
  const plan = await tx.wdfLinenPlan.findUnique({ where: { customerId } });
  if (action === "linen.plan") {
    requireOwner(user);
    if (plan && plan.version !== integer(body.version, "Rental agreement version")) throw new WdfError("Rental agreement changed. Reload before saving.", 409);
    if (typeof body.active !== "boolean") throw new WdfError("Invalid active flag.");
    const fields = {
      itemName: text(body.itemName, "Towel type", 200, true)!,
      towelsPerExchange: integer(body.towelsPerExchange, "Towels per exchange", 1, 100000),
      bagsPerExchange: integer(body.bagsPerExchange, "Bags per exchange", 0, 1000),
      weeklyFeeCents: body.weeklyFeeCents == null ? null : integer(body.weeklyFeeCents, "Weekly rental price", 1, 100000000),
      exchangeDay: body.exchangeDay == null ? null : integer(body.exchangeDay, "Exchange day", 0, 6),
      towelGrams: body.towelGrams == null ? null : integer(body.towelGrams, "Clean dry towel grams", 1, 10000),
      bagTareGrams: integer(body.bagTareGrams, "Empty bag grams", 0, 100000),
      notes: text(body.notes, "Agreement notes", 4000), active: body.active,
    };
    const saved = plan ? await tx.wdfLinenPlan.update({ where: { id: plan.id }, data: { ...fields, version: { increment: 1 } } }) :
      await tx.wdfLinenPlan.create({ data: { customerId, ...fields } });
    await tx.wdfAudit.create({ data: audit(user, customerId, "LINEN_AGREEMENT_SAVED", { before: plan, after: saved }) });
    return { plan: saved };
  }
  if (!plan) throw new WdfError("Create a rental agreement first.", 409);
  if (action === "linen.bill") {
    if (!plan.active || !customer.active) throw new WdfError("This rental account is inactive.", 409);
    const weekStart = serviceWeek(body.weekStart);
    const prior = await tx.wdfLinenCharge.findUnique({ where: { planId_weekStart: { planId: plan.id, weekStart } } });
    // An existing week's invoice is returned, never duplicated or repriced.
    if (prior) return { orderId: prior.orderId, alreadyBilled: true };
    if (plan.version !== integer(body.version, "Agreement version")) throw new WdfError("Rental agreement changed. Reload before billing.", 409);
    if (!plan.weeklyFeeCents) throw new WdfError("An owner must set an agreed weekly price before invoicing.");
    const description = "Weekly " + plan.itemName + " rental · week of " + weekStart + " · " + plan.towelsPerExchange + " towels per exchange";
    const order = await tx.wdfOrder.create({ data: {
      requestKey: "linen-" + plan.id + "-" + weekStart, requestDigest: digest,
      customerId, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
      preferences: customer.preferences, weightHundredths: 0, rateCents: 200, minimumCents: 0, pricingSource: "LINEN_AGREEMENT",
      pricingReason: "Agreed weekly linen rental", laundryCents: 0, totalCents: plan.weeklyFeeCents, status: "READY",
      createdById: user.id, createdByName: user.name,
      lines: { create: { description, quantity: 1, unitCents: plan.weeklyFeeCents, totalCents: plan.weeklyFeeCents } },
      audits: { create: { actorId: user.id, actorName: user.name, action: "LINEN_INVOICE_CREATED", detail: { planId: plan.id, weekStart, weeklyFeeCents: plan.weeklyFeeCents, towelsPerExchange: plan.towelsPerExchange } } },
    } });
    await tx.wdfLinenCharge.create({ data: { planId: plan.id, weekStart, orderId: order.id } });
    await tx.wdfLinenPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
    await tx.wdfAudit.create({ data: audit(user, customerId, "LINEN_WEEK_BILLED", { orderId: order.id, weekStart, amountCents: plan.weeklyFeeCents }) });
    return { orderId: order.id, alreadyBilled: false };
  }
  if (action !== "linen.exchange" && action !== "linen.reconcile") throw new WdfError("Unknown linen action.");
  const requestKey = key(body.requestKey);
  const existing = await tx.wdfLinenExchange.findUnique({ where: { requestKey } });
  if (existing) {
    if (existing.planId !== plan.id || existing.requestDigest !== digest) throw new WdfError("Request key was used for different exchange details.", 409);
    return { exchange: existing, balance: await custody(tx, plan.id) };
  }
  if (plan.version !== integer(body.version, "Inventory version")) throw new WdfError("Rental inventory changed. Reload before saving.", 409);
  const current = await custody(tx, plan.id);
  let movement: Movement = { towelsOut: 0, towelsIn: 0, towelsLost: 0, bagsOut: 0, bagsIn: 0, bagsLost: 0, towelAdjustment: 0, bagAdjustment: 0 };
  let countMethod = "COUNTED";
  let grossGrams: number | null = null, tareGrams: number | null = null, towelGrams: number | null = null;
  let reason: string | null = null;
  if (action === "linen.reconcile") {
    requireOwner(user);
    const towels = integer(body.towels, "Actual towels at customer", 0, 1000000);
    const bags = integer(body.bags, "Actual bags at customer", 0, 1000000);
    movement.towelAdjustment = towels - current.towels;
    movement.bagAdjustment = bags - current.bags;
    reason = text(body.reason, "Inventory correction reason", 2000, true);
    countMethod = "RECONCILED";
  } else {
    // Even paused/archived accounts can return stock, but cannot receive new stock.
    movement = { ...movement,
      towelsIn: integer(body.towelsIn, "Towels returned", 0, 100000),
      bagsOut: integer(body.bagsOut, "Clean bags delivered", 0, 1000),
      bagsIn: integer(body.bagsIn, "Bags returned", 0, 1000),
      towelsLost: integer(body.towelsLost ?? 0, "Towels written off", 0, 100000),
      bagsLost: integer(body.bagsLost ?? 0, "Bags written off", 0, 1000),
    };
    if (body.countMethod === "WEIGHT_ESTIMATE") {
      if (!plan.towelGrams) throw new WdfError("Calibrate a clean, dry towel weight first.");
      grossGrams = integer(body.grossGrams, "Gross clean towel weight", 1, 1000000);
      tareGrams = plan.bagTareGrams * movement.bagsOut;
      towelGrams = plan.towelGrams;
      movement.towelsOut = estimateTowels(grossGrams, tareGrams, towelGrams);
      countMethod = "WEIGHT_ESTIMATE";
    } else if (body.countMethod === "COUNTED") {
      movement.towelsOut = integer(body.towelsOut, "Clean towels delivered", 0, 100000);
    } else throw new WdfError("Select counted or clean dry weight estimate.");
    if ((!plan.active || !customer.active) && (movement.towelsOut > 0 || movement.bagsOut > 0)) throw new WdfError("Inactive accounts can return stock but cannot receive deliveries.", 409);
    if (movement.towelsLost || movement.bagsLost) {
      requireOwner(user);
      reason = text(body.reason, "Write-off reason", 2000, true);
    }
    if (Object.values(movement).every(n => n === 0)) throw new WdfError("Enter a delivery, return or write-off quantity.");
  }
  const next = applyMovement(current, movement);
  const exchange = await tx.wdfLinenExchange.create({ data: {
    planId: plan.id, requestKey, requestDigest: digest, kind: action === "linen.reconcile" ? "RECONCILE" : "EXCHANGE",
    ...movement, countMethod, grossGrams, tareGrams, towelGrams, reason,
    notes: text(body.notes, "Exchange notes", 4000), occurredAt: date(body.occurredAt, "Exchange date") ?? new Date(),
    actorId: user.id, actorName: user.name,
  } });
  await tx.wdfLinenPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
  await tx.wdfAudit.create({ data: audit(user, customerId, action === "linen.reconcile" ? "LINEN_RECONCILED" : "LINEN_EXCHANGED", { exchangeId: exchange.id, before: current, after: next, ...movement, countMethod, reason }) });
  return { exchange, balance: next };
}
