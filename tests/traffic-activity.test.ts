import { test } from "node:test";
import assert from "node:assert/strict";
import { trafficLevel, TRAFFIC_WINDOW_MS } from "../src/lib/traffic-activity";
test("rolling-hour activity bands preserve quiet, slow, average and busy boundaries", () => {
  assert.equal(TRAFFIC_WINDOW_MS, 3600000);
  for (const [count, label] of [[0,"Dead"],[1,"Slow"],[3,"Slow"],[4,"Average"],[9,"Average"],[10,"Busy"],[50,"Busy"]] as const) assert.equal(trafficLevel(count), label);
});
