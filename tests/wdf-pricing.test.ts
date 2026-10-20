
import test from "node:test";
import assert from "node:assert/strict";
import { quote, effectivePricing, paymentBalance, allowTransition, integer } from "../src/lib/wdf-pricing";

test("standard and negotiated prices, with exact expiration boundary", () => {
  const blank = { customRateCents: null, customMinimumCents: null, pricingExpiresAt: null };
  assert.deepEqual(effectivePricing(blank), { rateCents: 200, minimumCents: 2500, pricingSource: "STANDARD" });
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(effectivePricing({ ...blank, customRateCents: 175 }).rateCents, 175);
  assert.equal(effectivePricing({ ...blank, customMinimumCents: 0 }).minimumCents, 0);
  assert.equal(effectivePricing({ ...blank, customRateCents: 175, pricingExpiresAt: now }, now).rateCents, 200);
  assert.equal(effectivePricing({ ...blank, customRateCents: 175, pricingExpiresAt: new Date(now.getTime() + 1) }, now).rateCents, 175);
});
test("fractional pounds, minimum, specialty-only and mixed orders", () => {
  assert.equal(quote(2500, 200, 2500, []).totalCents, 5000);
  assert.equal(quote(100, 200, 2500, []).totalCents, 2500);
  assert.equal(quote(1234, 175, 0, []).totalCents, 2160);
  assert.equal(quote(0, 200, 2500, [{ quantity: 2, unitCents: 3000 }]).totalCents, 6000);
  assert.equal(quote(2500, 200, 2500, [{ quantity: 1, unitCents: 3000 }]).totalCents, 8000);
  assert.throws(() => quote(0, 200, 2500, []));
  assert.throws(() => quote(-1, 200, 2500, []));
  assert.throws(() => quote(100, 0, 2500, []));
  assert.throws(() => integer(1.5, "amount"));
  assert.throws(() => integer("200", "amount"));
});
test("payment balance accounts for refunds and reversed records", () => {
  assert.equal(paymentBalance([{ amountCents: 3000, voidedAt: null }, { amountCents: 2000, voidedAt: null }, { amountCents: -1000, voidedAt: null }, { amountCents: 1000, voidedAt: "date" }]), 4000);
});
test("processing transitions enforce staff and cancellation boundaries", () => {
  allowTransition("RECEIVED", "WASHING", false, 0);
  assert.throws(() => allowTransition("RECEIVED", "READY", false, 0));
  assert.throws(() => allowTransition("RECEIVED", "CANCELLED", false, 0));
  assert.throws(() => allowTransition("RECEIVED", "CANCELLED", true, 1));
  assert.throws(() => allowTransition("PICKED_UP", "CANCELLED", true, 0));
  assert.throws(() => allowTransition("CANCELLED", "RECEIVED", true, 0));
  allowTransition("RECEIVED", "CANCELLED", true, 0);
});
