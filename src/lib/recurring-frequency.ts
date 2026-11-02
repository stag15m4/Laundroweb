import { addWeeks, addMonths, addYears } from "date-fns";
import type { RecurringFrequency } from "@prisma/client";

// Split out from recurringExpenses.ts so this pure date math can be
// imported from a client component (e.g. to show "next due" in the UI)
// without pulling in the server-only Prisma Client code that file also
// imports.
export function stepForward(date: Date, frequency: RecurringFrequency): Date {
  switch (frequency) {
    case "WEEKLY":
      return addWeeks(date, 1);
    case "MONTHLY":
      return addMonths(date, 1);
    case "QUARTERLY":
      return addMonths(date, 3);
    case "YEARLY":
      return addYears(date, 1);
  }
}

/** Mirrors the server's generation logic, for display only (e.g. "Next due"
 * in the Recurring Expenses list) -- the actual Expense rows are only ever
 * created by GET /api/expenses. */
export function nextDueDate(template: {
  startDate: string | Date;
  lastGeneratedDate: string | Date | null;
  frequency: RecurringFrequency;
}): Date {
  if (!template.lastGeneratedDate) return new Date(template.startDate);
  return stepForward(new Date(template.lastGeneratedDate), template.frequency);
}
