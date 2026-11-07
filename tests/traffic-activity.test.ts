import { test } from "node:test";
import assert from "node:assert/strict";
import { trafficLevel, trafficDayStart } from "../src/lib/traffic-activity";
test("daily activity bands preserve quiet, slow, average and busy boundaries", () => {
  for (const [count, label] of [[0,"Dead"],[1,"Slow"],[3,"Slow"],[4,"Average"],[9,"Average"],[10,"Busy"],[50,"Busy"]] as const) assert.equal(trafficLevel(count), label);
});

test("daily window resets at Eastern midnight across seasons and DST transitions", () => {
  for (const [now, start] of [
    ["2026-11-07T19:00:00Z", "2026-11-07T05:00:00.000Z"],
    ["2026-07-01T18:00:00Z", "2026-07-01T04:00:00.000Z"],
    ["2026-11-07T04:59:59Z", "2026-11-06T05:00:00.000Z"],
    ["2026-03-08T18:00:00Z", "2026-03-08T05:00:00.000Z"],
    ["2026-11-01T18:00:00Z", "2026-11-01T04:00:00.000Z"],
  ]) assert.equal(trafficDayStart(new Date(now)).toISOString(), start);
});
