
import { randomUUID } from "node:crypto";

export async function wdfSmoke({ base, ownerHeaders, staffHeaders, check }) {
  console.log("\nWDF customer, pricing, order and payment lifecycle:");
  async function post(body, headers = ownerHeaders) {
    const response = await fetch(base + "/api/wdf", { method: "POST", headers, body: JSON.stringify(body) });
    const data = await response.json();
    return { status: response.status, ...data };
  }
  check("WDF rejects anonymous reads", (await fetch(base + "/api/wdf")).status === 401);
  const customerResult = await post({ action: "customer.create", name: "CI WDF " + randomUUID(), phone: "555-0100",
    preferences: "Fragrance free", customRateCents: 175, customMinimumCents: 2000, pricingReason: "Negotiated business account" });
  const customer = customerResult.customer;
  check("owner creates negotiated customer", Boolean(customer?.id));
  if (!customer?.id) throw new Error("WDF customer creation failed: " + JSON.stringify(customerResult));
  const forbidden = await post({ action: "customer.update", id: customer.id, version: customer.version, name: customer.name,
    customRateCents: 100, customMinimumCents: 0, pricingReason: "unauthorized" }, staffHeaders);
  check("staff cannot change negotiated pricing", forbidden.status === 403);
  const staffCustomer = await post({ action: "customer.create", name: "CI staff intake " + randomUUID() }, staffHeaders);
  check("staff can create standard-price customer", staffCustomer.customer?.customRateCents === null);

  const body = { action: "order.create", requestKey: randomUUID(), customerId: customer.id, weightHundredths: 2500, lines: [] };
  const [one, two] = await Promise.all([post(body, staffHeaders), post(body, staffHeaders)]);
  const order = one.order || two.order;
  check("concurrent duplicate order submission is idempotent", one.order?.id === two.order?.id && Boolean(order?.id));
  if (!order) throw new Error("Order failed: " + JSON.stringify([one, two]));
  check("negotiated rate applies automatically", order.rateCents === 175 && order.totalCents === 4375);
  check("preferences are saved with order", order.preferences === "Fragrance free");
  const override = await post({ ...body, requestKey: randomUUID(), rateCents: 100, minimumCents: 0, pricingReason: "unauthorized" }, staffHeaders);
  check("staff cannot override an order rate", override.status === 403);
  check("reused order key rejects different payload", (await post({ ...body, weightHundredths: 2600 }, staffHeaders)).status === 409);
  const updatedCustomer = await post({ action: "customer.update", id: customer.id, version: customer.version, name: "Renamed CI customer",
    customRateCents: 225, customMinimumCents: 2500, pricingReason: "New agreement", preferences: "Changed preference" });
  check("owner can update negotiated terms", updatedCustomer.customer?.customRateCents === 225);
  const snapshotRes = await fetch(base + "/api/wdf?orderId=" + order.id, { headers: ownerHeaders });
  const snapshot = (await snapshotRes.json()).order;
  check("old invoice keeps original price and customer snapshot", snapshot?.rateCents === 175 && snapshot.customerName === customer.name && snapshot.preferences === "Fragrance free");
  const paymentBody = { action: "payment.create", orderId: order.id, requestKey: randomUUID(), kind: "PAYMENT", method: "CASH", amountCents: 2000 };
  const [p1, p2] = await Promise.all([post(paymentBody, staffHeaders), post(paymentBody, staffHeaders)]);
  check("concurrent duplicate payment is recorded once", p1.order?.paidCents === 2000 && p2.order?.paidCents === 2000 && p1.order?.payments.length === 1);
  check("partial payment leaves correct balance", p1.order?.balanceCents === 2375 && p1.order?.paymentStatus === "PARTIAL");
  const card = { ...paymentBody, requestKey: randomUUID(), method: "CARD", amountCents: 2375 };
  check("card needs successful external charge confirmation", (await post(card, staffHeaders)).status === 400);
  const final = await post({ ...card, confirmed: true, reference: "CI-bank-123" }, staffHeaders);
  check("split cash/card settles invoice", final.order?.balanceCents === 0 && final.order?.paymentStatus === "PAID");
  const cashId = final.order?.payments.find(p => p.method === "CASH")?.id;
  check("overpayment rejected", (await post({ ...paymentBody, requestKey: randomUUID(), amountCents: 1 }, staffHeaders)).status === 409);
  check("staff cannot reverse payments", (await post({ action: "payment.void", orderId: order.id, paymentId: cashId, reason: "test" }, staffHeaders)).status === 403);
  const reverse = await post({ action: "payment.void", orderId: order.id, paymentId: cashId, reason: "Correction" });
  check("owner correction reopens balance and preserves entry", reverse.order?.balanceCents === 2000 && reverse.order?.payments.some(p => p.id === cashId && p.voidedAt));
  const checkBody = { ...paymentBody, requestKey: randomUUID(), method: "CHECK", amountCents: 2000 };
  check("check number required", (await post(checkBody, staffHeaders)).status === 400);
  const checked = await post({ ...checkBody, reference: "1001" }, staffHeaders);
  check("check can settle remaining balance", checked.order?.balanceCents === 0);
  const checkId = checked.order?.payments.find(p => p.method === "CHECK")?.id;
  const returned = await post({ action: "payment.void", orderId: order.id, paymentId: checkId, reason: "Returned check" });
  check("returned check restores amount due", returned.order?.balanceCents === 2000);

  const raceOrder = (await post({ ...body, requestKey: randomUUID() }, staffHeaders)).order;
  const race = await Promise.all([1, 2].map(() => post({ ...paymentBody, orderId: raceOrder.id, requestKey: randomUUID(), amountCents: raceOrder.totalCents }, staffHeaders)));
  check("competing full payments cannot overpay", race.filter(r => r.status === 200).length === 1 && race.filter(r => r.status === 409).length === 1);
  const paidRace = race.find(r => r.order)?.order;
  check("staff cannot refund", (await post({ action: "payment.create", orderId: raceOrder.id, requestKey: randomUUID(), method: "CASH", kind: "REFUND", amountCents: raceOrder.totalCents, reason: "test" }, staffHeaders)).status === 403);
  const refund = await post({ action: "payment.create", orderId: raceOrder.id, requestKey: randomUUID(), method: "CASH", kind: "REFUND", amountCents: raceOrder.totalCents, reason: "Customer cancellation" });
  check("owner refund preserves ledger", refund.order?.paidCents === 0 && refund.order?.payments.length === 2);
  const cancelled = await post({ action: "order.update", orderId: raceOrder.id, version: refund.order?.version, status: "CANCELLED", reason: "Customer cancellation", laborMinutes: 0 });
  check("owner can cancel refunded order", cancelled.order?.status === "CANCELLED");
  check("cancelled order rejects payment", (await post({ ...paymentBody, orderId: raceOrder.id, requestKey: randomUUID(), amountCents: 100 }, staffHeaders)).status === 409);
  const stale = await post({ action: "order.update", orderId: order.id, version: 0, status: "WASHING", laborMinutes: 10 }, staffHeaders);
  check("stale processing updates rejected", stale.status === 409);
  const fresh = (await (await fetch(base + "/api/wdf?orderId=" + order.id, { headers: staffHeaders })).json()).order;
  const work = await post({ action: "order.update", orderId: order.id, version: fresh.version, status: "WASHING", laborMinutes: 12, machineNotes: "Washer 3; dryer 2" }, staffHeaders);
  check("staff can process and record labor and machines", work.order?.laborMinutes === 12 && work.order?.status === "WASHING");
  check("financial audit includes named actor", work.order?.audits.some(a => a.action === "PAYMENT_REVERSED" && a.actorName));
  const detail = await (await fetch(base + "/api/wdf?customerId=" + customer.id, { headers: ownerHeaders })).json();
  check("CRM exposes invoice history and totals", detail.orders?.some(o => o.id === order.id) && detail.totals?.pounds === 25 && detail.totals?.totalCents === 4375);
  check("responses disable caching", snapshotRes.headers.get("cache-control") === "no-store");
  const print = await fetch(base + "/wdf/print/" + order.id, { headers: staffHeaders });
  check("staff can open printable invoice", print.status === 200);
  const malicious = await post({ ...paymentBody, requestKey: randomUUID() }, { ...ownerHeaders, Origin: "https://wrong.example" });
  check("foreign-origin writes rejected", malicious.status === 403);
}
