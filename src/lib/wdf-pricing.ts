
export const DEFAULT_RATE_CENTS = 200;
export const DEFAULT_MINIMUM_CENTS = 2500;
export const STATUSES = ["RECEIVED", "WASHING", "DRYING", "FOLDING", "READY", "PICKED_UP", "CANCELLED"] as const;
export type OrderStatus = typeof STATUSES[number];

export class WdfError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function integer(value: unknown, label: string, min = 0, max = 100000000): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new WdfError(label + " is invalid.");
  return value;
}
export function text(value: unknown, label: string, max = 2000, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new WdfError(label + " is required.");
    return null;
  }
  if (typeof value !== "string" || value.length > max) throw new WdfError(label + " is invalid.");
  const result = value.trim();
  if (!result && required) throw new WdfError(label + " is required.");
  return result || null;
}
export function date(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new WdfError(label + " must be a valid date and time.");
  return new Date(value);
}
export function key(value: unknown): string {
  const result = text(value, "Request key", 80, true)!;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(result)) throw new WdfError("Invalid request key.");
  return result;
}
export function effectivePricing(customer: {
  customRateCents: number | null;
  customMinimumCents: number | null;
  pricingExpiresAt: Date | null;
}, now = new Date()) {
  const negotiated = (!customer.pricingExpiresAt || customer.pricingExpiresAt > now) &&
    (customer.customRateCents !== null || customer.customMinimumCents !== null);
  return {
    rateCents: negotiated ? customer.customRateCents ?? DEFAULT_RATE_CENTS : DEFAULT_RATE_CENTS,
    minimumCents: negotiated ? customer.customMinimumCents ?? DEFAULT_MINIMUM_CENTS : DEFAULT_MINIMUM_CENTS,
    pricingSource: negotiated ? "CUSTOMER" : "STANDARD",
  };
}
export function quote(weight: number, rate: number, minimum: number, lines: { quantity: number; unitCents: number }[]) {
  integer(weight, "Dry weight", 0, 1000000);
  integer(rate, "Rate", 1, 10000);
  integer(minimum, "Minimum", 0, 1000000);
  if (!Array.isArray(lines) || lines.length > 30) throw new WdfError("Too many specialty items.");
  if (weight === 0 && lines.length === 0) throw new WdfError("Enter a weight or a specialty item.");
  const laundryCents = weight === 0 ? 0 : Math.max(Math.round(weight * rate / 100), minimum);
  const totals = lines.map(line => integer(line.quantity, "Quantity", 1, 1000) * integer(line.unitCents, "Item price", 1, 1000000));
  const totalCents = laundryCents + totals.reduce((sum, n) => sum + n, 0);
  integer(totalCents, "Order total", 1, 100000000);
  return { laundryCents, totalCents, lineTotals: totals };
}
export function paymentBalance(payments: { amountCents: number; voidedAt: unknown }[]) {
  return payments.filter(p => !p.voidedAt).reduce((sum, p) => sum + p.amountCents, 0);
}
export function allowTransition(current: string, next: string, owner: boolean, balance: number) {
  if (!(STATUSES as readonly string[]).includes(next)) throw new WdfError("Unknown order status.");
  if (current === next) return;
  if (current === "CANCELLED") throw new WdfError("Cancelled orders cannot be reopened.", 409);
  if (next === "CANCELLED") {
    if (!owner) throw new WdfError("Only an owner can cancel an order.", 403);
    if (balance !== 0) throw new WdfError("Refund or reverse payments before cancelling.", 409);
    if (current === "PICKED_UP") throw new WdfError("Picked-up orders cannot be cancelled.", 409);
    return;
  }
  const from = STATUSES.indexOf(current as OrderStatus);
  const to = STATUSES.indexOf(next as OrderStatus);
  if (!owner && to !== from + 1) throw new WdfError("Advance one processing step at a time.", 409);
}
