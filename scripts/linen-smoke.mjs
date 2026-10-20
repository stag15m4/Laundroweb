
import { randomUUID } from "node:crypto";
export async function linenSmoke({ base, ownerHeaders, staffHeaders, check }) {
  console.log("\nLinen rental custody and weekly invoicing:");
  async function post(body, headers = ownerHeaders) {
    const r = await fetch(base + "/api/wdf", { method: "POST", headers, body: JSON.stringify(body) });
    const data = await r.json(); return { status: r.status, ...data };
  }
  const customer = (await post({ action: "customer.create", name: "CI linen " + randomUUID() })).customer;
  if (!customer?.id) throw new Error("Linen test customer failed.");
  const cid = customer.id;
  const read = async (id = cid) => {
    const r = await fetch(base + "/api/wdf?linen=1&customerId=" + id, { headers: staffHeaders });
    return r.json();
  };
  const agreement = { action: "linen.plan", customerId: cid, itemName: "Bar towels", towelsPerExchange: 100, bagsPerExchange: 2,
    weeklyFeeCents: 3846, exchangeDay: 1, towelGrams: 50, bagTareGrams: 100, active: true };
  check("staff cannot set rental pricing", (await post(agreement, staffHeaders)).status === 403);
  const saved = await post(agreement);
  check("owner creates separate rental agreement", saved.plan?.weeklyFeeCents === 3846);
  const version = saved.plan?.version;
  const movement = { action: "linen.exchange", customerId: cid, version, requestKey: randomUUID(), countMethod: "COUNTED",
    towelsOut: 100, towelsIn: 0, bagsOut: 2, bagsIn: 0 };
  const duplicates = await Promise.all([post(movement, staffHeaders), post(movement, staffHeaders)]);
  check("duplicate first delivery recorded once", duplicates.every(d => d.status === 200) && duplicates[0].exchange?.id === duplicates[1].exchange?.id);
  let snapshot = await read();
  check("custody records initial 100 towels and 2 bags", snapshot.balance?.towels === 100 && snapshot.balance?.bags === 2 && snapshot.plan?.exchanges.length === 1);
  check("returns cannot exceed custody", (await post({ ...movement, requestKey: randomUUID(), version: snapshot.plan.version, towelsOut: 0, bagsOut: 0, towelsIn: 101 }, staffHeaders)).status === 400);
  const exchange = await post({ ...movement, requestKey: randomUUID(), version: snapshot.plan.version,
    towelsOut: 0, towelsIn: 95, bagsOut: 2, bagsIn: 1, countMethod: "WEIGHT_ESTIMATE", grossGrams: 5200 }, staffHeaders);
  check("weight estimates subtract bag tare on server", exchange.exchange?.towelsOut === 100 && exchange.exchange?.tareGrams === 200 && exchange.exchange?.countMethod === "WEIGHT_ESTIMATE");
  check("short returns stay outstanding without a loss charge", exchange.balance?.towels === 105 && exchange.balance?.bags === 3);
  snapshot = await read();
  const loss = { ...movement, requestKey: randomUUID(), version: snapshot.plan.version, towelsOut: 0, bagsOut: 0, towelsLost: 5, bagsLost: 1, reason: "Confirmed worn stock" };
  check("staff cannot write off losses", (await post(loss, staffHeaders)).status === 403);
  const writtenOff = await post(loss);
  check("owner write-off retains exchange record", writtenOff.balance?.towels === 100 && writtenOff.balance?.bags === 2);
  snapshot = await read();
  const correction = { action: "linen.reconcile", customerId: cid, version: snapshot.plan.version, requestKey: randomUUID(), towels: 110, bags: 2, reason: "Opening stock correction" };
  check("staff cannot reconcile stock", (await post(correction, staffHeaders)).status === 403);
  check("owner can reconcile stock", (await post(correction)).balance?.towels === 110);
  snapshot = await read();
  check("ledger preserves prior deliveries and write-offs", snapshot.plan.exchanges.length === 4 && snapshot.plan.exchanges.some(x => x.towelsLost === 5));
  check("stale inventory save rejected", (await post({ ...movement, requestKey: randomUUID() }, staffHeaders)).status === 409);
  check("reused exchange key rejects changed quantities", (await post({ ...movement, towelsOut: 200 }, staffHeaders)).status === 409);

  const bill = { action: "linen.bill", customerId: cid, version: snapshot.plan.version, weekStart: "2026-10-19" };
  const bills = await Promise.all([post(bill, staffHeaders), post(bill, staffHeaders)]);
  check("concurrent weekly invoice submissions produce one invoice", bills.every(b => b.status === 200) && bills[0].orderId === bills[1].orderId && Boolean(bills[0].orderId));
  const oid = bills[0].orderId;
  const invoice = await (await fetch(base + "/api/wdf?orderId=" + oid, { headers: staffHeaders })).json();
  check("weekly invoice uses flat agreement, not WDF minimum", invoice.order?.totalCents === 3846 && invoice.order?.weightHundredths === 0 && invoice.order?.pricingSource === "LINEN_AGREEMENT");
  const payment = await post({ action: "payment.create", orderId: oid, requestKey: randomUUID(), kind: "PAYMENT", method: "CASH", amountCents: 3846 }, staffHeaders);
  check("rental invoice accepts existing POS payments", payment.order?.balanceCents === 0);
  snapshot = await read();
  const changed = await post({ ...agreement, version: snapshot.plan.version, weeklyFeeCents: 4000 });
  check("owner changes future rental pricing", changed.plan?.weeklyFeeCents === 4000);
  const oldBill = await post({ ...bill, version: changed.plan.version }, staffHeaders);
  check("same service week opens original invoice after price change", oldBill.orderId === oid && oldBill.alreadyBilled === true);
  const stillOriginal = await (await fetch(base + "/api/wdf?orderId=" + oid, { headers: ownerHeaders })).json();
  check("old rental invoice price is immutable", stillOriginal.order?.totalCents === 3846);
  check("billing rejects non-Monday date", (await post({ ...bill, version: changed.plan.version, weekStart: "2026-10-20" }, staffHeaders)).status === 400);
  const paused = await post({ ...agreement, version: changed.plan.version, active: false });
  check("paused agreement rejects new delivery", (await post({ ...movement, requestKey: randomUUID(), version: paused.plan.version }, staffHeaders)).status === 409);
  const returned = await post({ ...movement, requestKey: randomUUID(), version: paused.plan.version, towelsOut: 0, bagsOut: 0, towelsIn: 110, bagsIn: 2 }, staffHeaders);
  check("paused agreement still accepts final stock return", returned.balance?.towels === 0 && returned.balance?.bags === 0);
  check("paused agreement cannot invoice another week", (await post({ ...bill, weekStart: "2026-10-26", version: paused.plan.version }, staffHeaders)).status === 409);
  const second = (await post({ action: "customer.create", name: "CI second linen " + randomUUID() })).customer;
  await post({ ...agreement, customerId: second.id });
  const other = await read(second.id);
  check("inventory stays isolated by customer", other.balance?.towels === 0 && other.plan?.exchanges.length === 0);
  const list = await (await fetch(base + "/api/wdf?linen=1", { headers: staffHeaders })).json();
  check("rental overview exposes account balances", list.plans?.some(p => p.customerId === cid && p.balance.towels === 0));
}
