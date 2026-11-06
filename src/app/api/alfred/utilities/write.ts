import { NextResponse } from "next/server";
import { Prisma, UtilityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alfredError } from "@/lib/alfred-write";
import { parseAlfredDate } from "@/lib/alfred-dates";
import { UTILITY_UNITS, normalizeUsageUnit } from "@/lib/utility-units";

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

// UtilityBill.cost is Decimal(10,2); UtilityBill.usageAmount is Decimal(10,3).
// A value past these bounds would pass JS validation but fail the insert
// during confirm, after the proposal token is already marked consumed --
// leaving no bill and a token that reports "already_confirmed" on retry.
const MAX_COST = 99_999_999.99;
const MAX_USAGE = 9_999_999.999;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
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
  const start = parseAlfredDate(body.billingPeriodStart, "billing_period_start");
  if (!start.ok) return start;

  if (body.billingPeriodEnd === undefined || body.billingPeriodEnd === null || body.billingPeriodEnd === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_billing_period_end", "No billingPeriodEnd was supplied. Use YYYY-MM-DD."),
    };
  }
  const end = parseAlfredDate(body.billingPeriodEnd, "billing_period_end");
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
    const parsed = parseAlfredDate(body.dueDate, "due_date");
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
  if (!Number.isFinite(usageAmount) || usageAmount < 0 || usageAmount > MAX_USAGE) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_usage_amount",
        `Could not read "${String(body.usageAmount)}" as a usage amount. Must be between 0 and ${MAX_USAGE}.`
      ),
    };
  }

  // ── Usage unit ─────────────────────────────────────────────────────────
  // Normalized against this type's exact dashboard vocabulary (not just
  // checked non-empty) because the Usage Unit dropdown on the Utilities page
  // matches by exact string -- a free-text value like "therms" (a real gas
  // bill's own wording) saves fine but then shows no selection there, since
  // the dropdown's value for gas is "Therm".
  const rawUsageUnit = typeof body.usageUnit === "string" ? body.usageUnit.trim() : "";
  if (!rawUsageUnit) {
    return {
      ok: false,
      response: alfredError(400, "missing_usage_unit", `No usageUnit was supplied. Use one of ${UTILITY_UNITS[type].join(", ")}.`),
    };
  }
  const usageUnit = normalizeUsageUnit(type, rawUsageUnit);
  if (!usageUnit) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_usage_unit",
        `"${rawUsageUnit}" is not a usage unit for ${type.toLowerCase()} bills. Use one of ${UTILITY_UNITS[type].join(", ")}.`
      ),
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
  if (!Number.isFinite(cost) || cost < 0 || cost > MAX_COST) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_cost",
        `Could not read "${String(body.cost)}" as a cost. Send a number of dollars between 0 and ${MAX_COST}.`
      ),
    };
  }

  // ── Summary, written for a person to approve ────────────────────────────
  const period = `${body.billingPeriodStart} to ${body.billingPeriodEnd}`;
  const provider = typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : null;
  const accountNumber = typeof body.accountNumber === "string" && body.accountNumber.trim() ? body.accountNumber.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const typeLower = type.toLowerCase();
  const article = /^[aeiou]/.test(typeLower) ? "an" : "a";
  const summary =
    `Log ${article} ${typeLower} bill${provider ? ` from ${provider}` : ""} for ${period}: ` +
    `${usageAmount} ${usageUnit}, total ${money(cost)}` +
    `${dueDate ? `, due ${dueDate.toISOString().slice(0, 10)}` : ""}` +
    `${accountNumber ? `, account ${accountNumber}` : ""}.` +
    `${notes ? ` Notes: ${notes}` : ""}`;

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
      accountNumber,
      notes,
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
