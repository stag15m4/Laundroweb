import { prisma } from "@/lib/prisma";
import { RecurringFrequency } from "@prisma/client";
import { alfredError } from "@/lib/alfred-write";
import { parseAlfredDate } from "@/lib/alfred-dates";
import type { NextResponse } from "next/server";

const FREQUENCIES = Object.values(RecurringFrequency) as string[];

export type RecurringExpensePayload = {
  category: string;
  description: string;
  amount: number;
  frequency: string;
  startDate: string;
  vendor: string | null;
  notes: string | null;
};

export type Validated =
  | { ok: true; payload: RecurringExpensePayload; summary: string }
  | { ok: false; response: NextResponse };

// RecurringExpense.amount is Decimal(10,2); a value past this bound would
// pass JS validation but fail the insert during confirm, after the proposal
// token is already marked consumed -- leaving no template and a token that
// reports "already_confirmed" on retry.
const MAX_AMOUNT = 99_999_999.99;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

const FREQUENCY_ADVERB: Record<string, string> = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
};

/**
 * Turns a propose body into resolved, writable values -- or into the reason
 * it cannot be written. Nothing here touches the real tables; actually
 * generating the first Expense row happens later and lazily, the same way
 * it does for a template created from the dashboard (see
 * generateDueRecurringExpenses, run from GET /api/expenses).
 *
 * category is not checked against the dashboard's suggested category list
 * (Rent / Lease, Insurance, Supplies, ...) because that list is a client-side
 * Select convenience, not a schema constraint -- the human-facing POST
 * /api/recurring-expenses doesn't enforce it either, so Alfred isn't held to
 * a stricter rule than a person typing the same field.
 */
export async function validateRecurringExpense(body: Record<string, unknown>): Promise<Validated> {
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) {
    return {
      ok: false,
      response: alfredError(400, "missing_category", "No category was supplied, e.g. Rent / Lease, Insurance or Supplies."),
    };
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return { ok: false, response: alfredError(400, "missing_description", "No description was supplied.") };
  }

  if (body.amount === undefined || body.amount === null || body.amount === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_amount", "No amount was supplied. Send the amount due each time, in dollars."),
    };
  }
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_amount",
        `Could not read "${String(body.amount)}" as an amount. Send a positive number of dollars up to ${MAX_AMOUNT}.`
      ),
    };
  }

  const rawFrequency = body.frequency;
  if (typeof rawFrequency !== "string" || rawFrequency.trim() === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_frequency", `No frequency was supplied. Use one of ${FREQUENCIES.join(", ")}.`),
    };
  }
  const frequency = rawFrequency.trim().toUpperCase();
  if (!FREQUENCIES.includes(frequency)) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_frequency",
        `"${rawFrequency}" is not a frequency. Use one of ${FREQUENCIES.join(", ")}.`
      ),
    };
  }

  if (body.startDate === undefined || body.startDate === null || body.startDate === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_start_date", "No startDate was supplied. Use YYYY-MM-DD."),
    };
  }
  const startDate = parseAlfredDate(body.startDate, "start_date");
  if (!startDate.ok) return startDate;

  const vendor = typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const summary =
    `Set up a recurring ${category} expense of ${money(amount)}, ${FREQUENCY_ADVERB[frequency]}, ` +
    `starting ${body.startDate}${vendor ? `, from ${vendor}` : ""}: ${description}.` +
    `${notes ? ` Notes: ${notes}` : ""}`;

  return {
    ok: true,
    summary,
    payload: { category, description, amount, frequency, startDate: startDate.date.toISOString(), vendor, notes },
  };
}

/** Performs the write described by a confirmed proposal. */
export async function writeRecurringExpense(payload: RecurringExpensePayload) {
  return prisma.recurringExpense.create({
    data: {
      category: payload.category,
      description: payload.description,
      amount: payload.amount,
      frequency: payload.frequency as RecurringFrequency,
      startDate: new Date(payload.startDate),
      vendor: payload.vendor,
      notes: payload.notes,
    },
  });
}
