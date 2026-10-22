// CI-only signed provider responses, so integration tests never depend on a
// live third-party geocoder. Uses the same disposable secret as the test app.
import { createHmac } from "node:crypto";
export const testLocation = {
  inputAddress: "100 Test Street, Dunn, NC 28334", matchedAddress: "100 TEST ST, DUNN, NC, 28334",
  latitude: 35.30, longitude: -78.61, county: "Harnett County", countyFips: "37085", state: "NC",
  source: "US_CENSUS", lookedUpAt: "2026-10-20T00:00:00.000Z",
};
export function fixtureToken(location, userId, customerId, expires = Date.now() + 900000) {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("Disposable CI secret is required.");
  const payload = Buffer.from(JSON.stringify({ location, userId, customerId, expires })).toString("base64url");
  return payload + "." + createHmac("sha256", process.env.NEXTAUTH_SECRET).update("wdf-address-v1:" + payload).digest("base64url");
}
export async function saveTestLocation({ base, headers, customer, location = testLocation }) {
  const directory = await (await fetch(base + "/api/wdf?agreements=1&customerId=" + customer.id, { headers })).json();
  const response = await fetch(base + "/api/wdf", { method: "POST", headers, body: JSON.stringify({
    action: "customer.addresses", customerId: customer.id, version: customer.version,
    billingAddress: "PO Box 100, Dunn, NC 28335", deliveryAddress: location.inputAddress,
    locationToken: fixtureToken(location, directory.currentUserId, customer.id),
  }) });
  const result = await response.json();
  if (!response.ok) throw new Error("CI address save failed: " + JSON.stringify(result));
  return result.customer;
}
