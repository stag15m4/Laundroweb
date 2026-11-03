import { prisma } from "@/lib/prisma";
import { alfredError } from "@/lib/alfred-write";
import { parseAlfredDate } from "@/lib/alfred-dates";
import type { NextResponse } from "next/server";

export type ExpensePayload = {
  date: string;
  category: string;
  description: string;
  amount: number;
  vendor: string | null;
  notes: string | null;
};

export type Validated =
  | { ok: true; payload: ExpensePayload; summary: string }
  | { ok: false; response: NextResponse };

// Expense.amount is Decimal(10,2); a value past this bound would pass JS
// validation but fail the insert during confirm, after the proposal token is
// already marked consumed -- leaving no expense and a token that reports
// "already_confirmed" on retry.
const MAX_AMOUNT = 99_999_999.99;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Turns a propose body into resolved, writable values -- or into the reason
 * it cannot be written. Nothing here touches the real tables. Mirrors
 * validateUtilityBill's shape; see that file for the date-parsing rationale.
 *
 * category is not checked against the dashboard's suggested category list
 * (Rent / Lease, Insurance, Supplies, ...) because that list is a client-side
 * Select convenience, not a schema constraint -- the human-facing POST
 * /api/expenses doesn't enforce it either, so Alfred isn't held to a
 * stricter rule than a person typing the same field.
 */
export async function validateExpense(body: Record<string, unknown>): Promise<Validated> {
  if (body.date === undefined || body.date === null || body.date === "") {
    return { ok: false, response: alfredError(400, "missing_date", "No date was supplied. Use YYYY-MM-DD.") };
  }
  const date = parseAlfredDate(body.date, "date");
  if (!date.ok) return date;

  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) {
    return {
      ok: false,
      response: alfredError(400, "missing_category", "No category was supplied, e.g. Repairs, Supplies or Insurance."),
    };
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return {
      ok: false,
      response: alfredError(400, "missing_description", "No description was supplied."),
    };
  }

  if (body.amount === undefined || body.amount === null || body.amount === "") {
    return {
      ok: false,
      response: alfredError(400, "missing_amount", "No amount was supplied. Send the total due, in dollars."),
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

  const vendor = typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const summary =
    `Log a ${money(amount)} ${category} expense${vendor ? ` from ${vendor}` : ""}, ` +
    `dated ${body.date}: ${description}.` +
    `${notes ? ` Notes: ${notes}` : ""}`;

  return {
    ok: true,
    summary,
    payload: { date: date.date.toISOString(), category, description, amount, vendor, notes },
  };
}

/** Performs the write described by a confirmed proposal. */
export async function writeExpense(payload: ExpensePayload) {
  return prisma.expense.create({
    data: {
      date: new Date(payload.date),
      category: payload.category,
      description: payload.description,
      amount: payload.amount,
      vendor: payload.vendor,
      notes: payload.notes,
    },
  });
}
