import test from "node:test";
import assert from "node:assert/strict";
import { censusMatches, lookupAddress } from "../src/lib/wdf-geocoding";
import { signLocation, verifyLocation } from "../src/lib/wdf-geocode-token";
import { CLW_LOCATION, locationSnapshot, mapsUrl } from "../src/lib/wdf-location";

const address = "100 Test St, Dunn, NC 28334";
const match = { matchedAddress: "100 TEST ST, DUNN, NC, 28334", coordinates: { x: -78.61, y: 35.30 },
  geographies: { Counties: [{ GEOID: "37085", STATE: "37", NAME: "Harnett County" }] } };
const response = (matches: unknown[]) => ({ result: { addressMatches: matches } });

test("county comes from Census geography, with all distinct candidates retained", () => {
  const alternative = { ...match, matchedAddress: "100 TEST ST, OTHER CITY, NC, 28334", geographies: { Counties: [{ GEOID: "37163", STATE: "37", NAME: "Sampson County" }] } };
  const result = censusMatches(response([match, alternative, match]), address);
  assert.equal(result.length, 2);
  assert.equal(result[0].countyFips, "37085"); assert.equal(result[1].countyFips, "37163");
  assert.equal(result[0].inputAddress, address);
  assert.equal(result[0].latitude, 35.30); assert.equal(result[0].longitude, -78.61);
  assert.deepEqual(censusMatches(response([]), address), []);
  assert.throws(() => censusMatches({}, address), /invalid response/);
  for (const invalid of [
    { ...match, coordinates: { x: NaN, y: 35 } },
    { ...match, geographies: { Counties: [] } },
    { ...match, geographies: { Counties: [{ GEOID: "51001", STATE: "51", NAME: "Outside NC" }] } },
  ]) assert.throws(() => censusMatches(response([invalid]), address), /No North Carolina/);
});

test("lookup uses geography API with timeout and no address-bearing error messages", async () => {
  let called = false;
  const fetcher: typeof fetch = async (input, options) => {
    called = true; const url = new URL(String(input));
    assert.equal(url.hostname, "geocoding.geo.census.gov");
    assert.equal(url.searchParams.get("address"), address);
    assert.equal(url.searchParams.get("layers"), "Counties");
    assert.equal(options?.cache, "no-store"); assert.ok(options?.signal);
    return new Response(JSON.stringify(response([match])));
  };
  assert.equal((await lookupAddress(address, fetcher))[0].county, "Harnett County"); assert.ok(called);
  await assert.rejects(() => lookupAddress(address, async () => { throw new Error(address); }), e => {
    assert.ok(e instanceof Error); assert.ok(!e.message.includes(address)); return /unavailable/.test(e.message);
  });
});

test("confirmation binds the reviewed match to user, customer, address and expiration", () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "unit-test-geocoding-secret";
  try {
    const location = censusMatches(response([match]), address)[0];
    const token = signLocation(location, "staff1", "customer1", 1000);
    assert.deepEqual(verifyLocation(token, "staff1", "customer1", address, 2000), location);
    for (const [user, customer, requested, now] of [["staff2", "customer1", address, 2000], ["staff1", "customer2", address, 2000], ["staff1", "customer1", "Changed address", 2000], ["staff1", "customer1", address, 901000]] as const)
      assert.throws(() => verifyLocation(token, user, customer, requested, now), /expired or changed/);
    const [payload, sig] = token.split(".");
    const changed = JSON.parse(Buffer.from(payload, "base64url").toString()); changed.location.countyFips = "37163";
    assert.throws(() => verifyLocation(Buffer.from(JSON.stringify(changed)).toString("base64url") + "." + sig, "staff1", "customer1", address, 2000), /expired or changed/);
  } finally { if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = previousSecret; }
});

test("pickup uses CLW and delivery/rental use independent customer snapshots", () => {
  const delivery = censusMatches(response([match]), address)[0];
  assert.deepEqual(locationSnapshot("PICKUP", delivery), CLW_LOCATION);
  const snapshot = locationSnapshot("DELIVERY", delivery)!;
  assert.deepEqual(locationSnapshot("LINEN", delivery), snapshot);
  delivery.county = "Changed county";
  assert.equal(snapshot.county, "Harnett County");
  assert.equal(locationSnapshot("LINEN", null), null);
  assert.throws(() => locationSnapshot("UNSUPPORTED", delivery));
  assert.ok(mapsUrl(snapshot).startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.equal(new URL(mapsUrl(CLW_LOCATION)).searchParams.get("query"), CLW_LOCATION.matchedAddress);
});
