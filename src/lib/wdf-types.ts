
export type Customer = {
  id: string; name: string; company: string | null; phone: string | null; email: string | null;
  preferences: string | null; notes: string | null; customRateCents: number | null; customMinimumCents: number | null;
  pricingExpiresAt: string | null; pricingReason: string | null; active: boolean; version: number;
  rateCents: number; minimumCents: number; pricingSource: string;
  _count?: { orders: number }; audits?: Audit[];
};
export type Audit = { id: string; action: string; actorName: string; createdAt: string; detail: unknown };
export type Payment = {
  id: string; amountCents: number; method: string; kind: string; reference: string | null;
  reason: string | null; recordedByName: string; createdAt: string; voidedAt: string | null; voidReason: string | null;
};
export type Order = {
  id: string; number: number; customerId: string; customerName: string; customerPhone: string | null; customerEmail: string | null;
  preferences: string | null; weightHundredths: number; rateCents: number; minimumCents: number;
  pricingSource: string; pricingReason: string | null; laundryCents: number; totalCents: number;
  status: string; dueAt: string | null; notes: string | null; machineNotes: string | null; laborMinutes: number;
  version: number; createdAt: string; createdByName: string;
  paidCents: number; balanceCents: number; paymentStatus: string;
  lines: { id: string; description: string; quantity: number; unitCents: number; totalCents: number }[];
  payments: Payment[]; audits: Audit[];
};
export type Summary = { orders: number; totalCents: number; paidCents: number; balanceCents: number; pounds: number; laborMinutes: number };
export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const statusLabel = (status: string) => status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, s => s.toUpperCase());
export const displayDate = (value: string | null) => value ? new Date(value).toLocaleString() : "Not set";
