import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProtectAlarm, ProtectInputError, readProtectBody, verifyProtectToken } from "../src/lib/protect";

const alarm = { alarm: { name: "Entrance test", triggers: [{ key: "line", device: "camera" }] }, timestamp: 1792100000000 };

test("webhook auth fails closed with a separate, sufficiently long credential", () => {
  const secret = "a".repeat(40);
  assert.equal(verifyProtectToken(secret, secret), true);
  for (const header of [null, "", "wrong", `${secret}x`]) assert.equal(verifyProtectToken(header, secret), false);
  assert.equal(verifyProtectToken("short", "short"), false);
  assert.equal(verifyProtectToken(secret, ""), false);
});

test("only identical payloads are deduplicated, independent of JSON object-key order", () => {
  const first = parseProtectAlarm(alarm);
  const reordered = parseProtectAlarm({ timestamp: alarm.timestamp, alarm: { triggers: [{ device: "camera", key: "line" }], name: "Entrance test" } });
  assert.equal(first.deliveryHash, reordered.deliveryHash);
  assert.notEqual(first.deliveryHash, parseProtectAlarm({ ...alarm, timestamp: alarm.timestamp + 1 }).deliveryHash);
  assert.deepEqual(first.payload, alarm);
  assert.equal("direction" in first, false);
  assert.equal("count" in first, false);
});

test("reject malformed alarms and invalid timestamps", () => {
  for (const body of [null, [], {}, { alarm: [] }, { ...alarm, timestamp: "today" }, { ...alarm, timestamp: Infinity }, { ...alarm, timestamp: 1e17 }, { ...alarm, alarm: { name: "" } }]) {
    assert.throws(() => parseProtectAlarm(body), ProtectInputError);
  }
});

test("body limit works without Content-Length, including multibyte text", async () => {
  const request = (body: string) => new Request("https://example.com", { method: "POST", body });
  assert.deepEqual(await readProtectBody(request(JSON.stringify(alarm))), alarm);
  await assert.rejects(readProtectBody(request("{")), /valid JSON/);
  await assert.rejects(readProtectBody(request(JSON.stringify({ value: "é".repeat(17000) }))), (error: unknown) => error instanceof ProtectInputError && error.status === 413);
});
