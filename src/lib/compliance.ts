export const statuses = ["pending", "in_progress", "completed", "cancelled"] as const;
export const recurrences = ["none", "monthly", "quarterly", "yearly"] as const;
export const deadlineTypes = ["business_license", "tax_filing", "insurance_renewal", "pci_compliance", "other"] as const;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function nextDueDate(value: string, recurrence: string): string {
  if (!validDate(value)) throw new Error("Invalid due date");
  const [year, month, day] = value.split("-").map(Number);
  const months = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : recurrence === "yearly" ? 12 : 0;
  if (!months) throw new Error("Invalid recurrence");
  const next = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}
export function validateDeadline(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Invalid deadline");
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 500 || !validDate(b.dueDate)) throw new Error("Enter a title and valid due date");
  if (b.notes != null && (typeof b.notes !== "string" || b.notes.length > 50000)) throw new Error("Notes are too long");
  if (!(deadlineTypes as readonly unknown[]).includes(b.deadlineType) || !(recurrences as readonly unknown[]).includes(b.recurrence)) throw new Error("Invalid deadline type or recurrence");
  return { title: b.title.trim(), dueDate: b.dueDate, notes: (b.notes as string | undefined)?.trim() || null,
    deadlineType: b.deadlineType as string, recurrence: b.recurrence as string };
}
