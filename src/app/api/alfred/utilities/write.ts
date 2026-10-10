import { NextResponse } from "next/server";
import { Prisma, UtilityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alfredError } from "@/lib/alfred-write";

const TYPES = Object.values(UtilityType) as string[];

export type UtilityBillPayload = {
  type: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string | null;
  usageAmount: number;
  usageUnit: string;
  cost: number;
  provider: string | null;
  accountNumber: string | null;
  notes: string | null;
};

export type Validated =
  | { ok: true; payload: UtilityBillPayload; summary: string }
  | { ok: false; response: NextResponse };

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** A bare yyyy-MM-dd is read at midday so the calendar date cannot slip a day west of UTC. */
function parseDate(raw: unknown, field: string): { ok: true; date: Date } | { ok: false; response: NextResponse } {
  if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
    return {
      ok: false,
      response: alfredError(400, `invalid_${field}`, `Could not read "${String(raw)}" as a date. Use YYYY-MM-DD.`),
    };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  return { ok: true, date };
}

/**
 * Turns a propose body into resolved, writable values — or into the reason it
 * cannot be written. Nothing here touches the real tables.
 */
export async function validateUtilityBill(body: Record<string, unknown>): Promise<Validated> {
  // ── Type ───────────────────────────────────────────────────────────────
  const rawType = body.type;
  if (typeof rawType !== "string" || rawType.trim() === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_type", `No type was supplied. Use one of ${TYPES.join(", ")}.`),
    };
  }
  const type = rawType.trim().toUpperCase();
  if (!TYPES.includes(type)) {
    return {
      ok: false,
      response: alfredError(400, "invalid_type", `"${rawType}" is not a utility type. Use one of ${TYPES.join(", ")}.`),
    };
  }

  // ── Billing period ─────────────────────────────────────────────────────
  if (body.billingPeriodStart === undefined || body.billingPeriodStart === null || body.billingPeriodStart === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_billing_period_start", "No billingPeriodStart was supplied. Use YYYY-MM-DD."),
    };
  }
  const start = parseDate(body.billingPeriodStart, "billing_period_start");
  if (!start.ok) return start;

  if (body.billingPeriodEnd === undefined || body.billingPeriodEnd === null || body.billingPeriodEnd === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_billing_period_end", "No billingPeriodEnd was supplied. Use YYYY-MM-DD."),
    };
  }
  const end = parseDate(body.billingPeriodEnd, "billing_period_end");
  if (!end.ok) return end;

  if (end.date < start.date) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_billing_period",
        `billingPeriodEnd (${body.billingPeriodEnd}) is before billingPeriodStart (${body.billingPeriodStart}).`
      ),
    };
  }

  // ── Due date (optional) ────────────────────────────────────────────────
  let dueDate: Date | null = null;
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== "") {
    const parsed = parseDate(body.dueDate, "due_date");
    if (!parsed.ok) return parsed;
    dueDate = parsed.date;
  }

  // ── Usage amount ───────────────────────────────────────────────────────
  if (body.usageAmount === undefined || body.usageAmount === null || body.usageAmount === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_usage_amount", "No usageAmount was supplied, e.g. 1268 for kWh."),
    };
  }
  const usageAmount = typeof body.usageAmount === "number" ? body.usageAmount : Number(body.usageAmount);
  if (!Number.isFinite(usageAmount) || usageAmount < 0) {
    return {
      ok: false,
      response: alfredError(400, "invalid_usage_amount", `Could not read "${String(body.usageAmount)}" as a usage amount.`),
    };
  }

  // ── Usage unit ─────────────────────────────────────────────────────────
  const usageUnit = typeof body.usageUnit === "string" ? body.usageUnit.trim() : "";
  if (!usageUnit) {
    return {
      ok: false,
      response: alfredError(400, "missing_usage_unit", "No usageUnit was supplied, e.g. kWh, gallons or therms."),
    };
  }

  // ── Cost ───────────────────────────────────────────────────────────────
  if (body.cost === undefined || body.cost === null || body.cost === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_cost", "No cost was supplied. Send the total amount due, in dollars."),
    };
  }
  const cost = typeof body.cost === "number" ? body.cost : Number(body.cost);
  if (!Number.isFinite(cost) || cost < 0) {
    return {
      ok: false,
      response: alfredError(400, "invalid_cost", `Could not read "${String(body.cost)}" as a cost. Send a number of dollars.`),
    };
  }

  // ── Summary, written for a person to approve ────────────────────────────
  const period = `${body.billingPeriodStart} to ${body.billingPeriodEnd}`;
  const provider = typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : null;
  const typeLower = type.toLowerCase();
  const article = /^[aeiou]/.test(typeLower) ? "an" : "a";
  const summary =
    `Log ${article} ${typeLower} bill${provider ? ` from ${provider}` : ""} for ${period}: ` +
    `${usageAmount} ${usageUnit}, total ${money(cost)}` +
    `${dueDate ? `, due ${dueDate.toISOString().slice(0, 10)}` : ""}.`;

  return {
    ok: true,
    summary,
    payload: {
      type,
      billingPeriodStart: start.date.toISOString(),
      billingPeriodEnd: end.date.toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : null,
      usageAmount,
      usageUnit,
      cost,
      provider,
      accountNumber: typeof body.accountNumber === "string" && body.accountNumber.trim() ? body.accountNumber.trim() : null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    },
  };
}

/** Performs the write described by a confirmed proposal. */
export async function writeUtilityBill(payload: UtilityBillPayload) {
  return prisma.utilityBill.create({
    data: {
      type: payload.type as UtilityType,
      billingPeriodStart: new Date(payload.billingPeriodStart),
      billingPeriodEnd: new Date(payload.billingPeriodEnd),
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      usageAmount: new Prisma.Decimal(payload.usageAmount),
      usageUnit: payload.usageUnit,
      cost: new Prisma.Decimal(payload.cost),
      provider: payload.provider,
      accountNumber: payload.accountNumber,
      notes: payload.notes,
    },
  });
}
