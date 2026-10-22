import { randomUUID } from "node:crypto";
import { fixtureToken, saveTestLocation, testLocation } from "./geolocation-fixture.mjs";

export async function geolocationSmoke({ base, ownerHeaders, staffHeaders, check }) {
  console.log("\nService addresses, county confirmations and invoice snapshots:");
  const post = async (body, headers = ownerHeaders, path = "/api/wdf") => {
    const response = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  };
  let customer = (await post({ action: "customer.create", name: "CI delivery " + randomUUID() })).customer;
  const directory = await (await fetch(base + "/api/wdf?agreements=1&customerId=" + customer.id, { headers: ownerHeaders })).json();
  const uid = directory.currentUserId;
  const addresses = { action: "customer.addresses", customerId: customer.id, version: customer.version,
    billingAddress: "PO Box 100, Dunn, NC 28335", deliveryAddress: testLocation.inputAddress };
  check("anonymous geocoding rejected", (await post({ address: testLocation.inputAddress }, { "Content-Type": "application/json", Origin: base }, "/api/wdf/geocode")).status === 401);
  check("foreign-origin geocoding rejected", (await post({ address: testLocation.inputAddress }, { ...ownerHeaders, Origin: "https://other.example" }, "/api/wdf/geocode")).status === 403);
  check("incomplete geocoding request rejected without external lookup", (await post({ customerId: customer.id, address: "" }, ownerHeaders, "/api/wdf/geocode")).status === 400);
  check("unmatched address cannot be saved as confirmed", (await post({ ...addresses, deliveryLocation: testLocation })).status === 400);
  check("expired geocode rejected", (await post({ ...addresses, locationToken: fixtureToken(testLocation, uid, customer.id, 1) })).status === 400);
  check("geocode cannot be used for another customer", (await post({ ...addresses, locationToken: fixtureToken(testLocation, uid, "different-customer") })).status === 400);
  check("geocode cannot be used by another staff member", (await post({ ...addresses, locationToken: fixtureToken(testLocation, uid, customer.id) }, staffHeaders)).status === 400);
  const orderInput = { action: "order.create", customerId: customer.id, weightHundredths: 2000, lines: [], fulfillment: "DELIVERY" };
  check("delivery order requires a confirmed address", (await post({ ...orderInput, requestKey: randomUUID(), customerVersion: customer.version })).status === 400);
  customer = await saveTestLocation({ base, headers: staffHeaders, customer });
  check("staff can confirm customer address without changing pricing", customer.deliveryLocation?.countyFips === "37085" && customer.deliveryLocation.confirmedByName && customer.customRateCents === null);
  check("stale address save rejected", (await post({ ...addresses, deliveryAddress: "" })).status === 409);
  check("delivery rejects a stale customer selection", (await post({ ...orderInput, requestKey: randomUUID(), customerVersion: 0 })).status === 409);
  const delivered = (await post({ ...orderInput, requestKey: randomUUID(), customerVersion: customer.version }, staffHeaders)).order;
  check("delivery invoice snapshots service county separately from billing address", delivered?.serviceLocation?.countyFips === "37085" && delivered.billingAddress === customer.billingAddress && delivered.fulfillment === "DELIVERY");
  const pickup = (await post({ ...orderInput, fulfillment: "PICKUP", requestKey: randomUUID() }, staffHeaders)).order;
  check("customer pickup is sourced to CLW despite another billing or delivery county", pickup?.serviceLocation?.countyFips === "37163" && pickup.fulfillment === "PICKUP");
  const plan = (await post({ action: "linen.plan", customerId: customer.id, itemName: "Towels", towelsPerExchange: 100, bagsPerExchange: 1, weeklyFeeCents: 3500, exchangeDay: 1, bagTareGrams: 0, active: true })).plan;
  const bill = await post({ action: "linen.bill", customerId: customer.id, version: plan.version, weekStart: "2026-10-19" });
  const readOrder = async id => (await (await fetch(base + "/api/wdf?orderId=" + id, { headers: staffHeaders })).json()).order;
  check("rental invoice snapshots primary linen location", (await readOrder(bill.orderId)).serviceLocation?.countyFips === "37085");
  const changed = { ...testLocation, inputAddress: "200 New Street, Clinton, NC 28328", matchedAddress: "200 NEW ST, CLINTON, NC, 28328", county: "Sampson County", countyFips: "37163" };
  customer = await saveTestLocation({ base, headers: ownerHeaders, customer, location: changed });
  check("customer relocation cannot rewrite delivered invoice", (await readOrder(delivered.id)).serviceLocation.inputAddress === testLocation.inputAddress);
  check("customer relocation cannot rewrite linen invoice", (await readOrder(bill.orderId)).serviceLocation.countyFips === "37085");
  check("address audit records named reviewer", customer.deliveryLocation.confirmedByName && customer.deliveryLocation.confirmedAt);
  const cleared = await post({ action: "customer.addresses", customerId: customer.id, version: customer.version, billingAddress: "", deliveryAddress: "" });
  check("address can be removed without changing invoice snapshots", cleared.customer?.deliveryLocation === null && (await readOrder(delivered.id)).serviceLocation.countyFips === "37085");
  const currentPlan = (await (await fetch(base + "/api/wdf?linen=1&customerId=" + customer.id, { headers: ownerHeaders })).json()).plan;
  check("new linen invoice requires primary location", (await post({ action: "linen.bill", customerId: customer.id, version: currentPlan.version, weekStart: "2026-10-26" })).status === 400);
  check("existing linen week can reopen after address removed", (await post({ action: "linen.bill", customerId: customer.id, version: currentPlan.version, weekStart: "2026-10-19" })).orderId === bill.orderId);
}
