
import test from "node:test";
import assert from "node:assert/strict";
import { applyMovement, balance, estimateTowels, serviceWeek } from "../src/lib/linen";
const zero = { towelsOut: 0, towelsIn: 0, towelsLost: 0, bagsOut: 0, bagsIn: 0, bagsLost: 0, towelAdjustment: 0, bagAdjustment: 0 };
test("initial delivery and exchanges preserve customer custody", () => {
  const first = { ...zero, towelsOut: 100, bagsOut: 2 };
  const second = { ...zero, towelsOut: 100, towelsIn: 95, bagsOut: 2, bagsIn: 1 };
  assert.deepEqual(balance([first, second]), { towels: 105, bags: 3 });
  assert.deepEqual(applyMovement({ towels: 105, bags: 3 }, { ...zero, towelsLost: 5, bagsLost: 1 }), { towels: 100, bags: 2 });
  assert.throws(() => applyMovement({ towels: 100, bags: 2 }, { ...zero, towelsIn: 101 }));
  assert.deepEqual(balance([{ ...zero, towelAdjustment: 200, bagAdjustment: 4 }, { ...zero, towelAdjustment: -100, bagAdjustment: -2 }]), { towels: 100, bags: 2 });
});
test("clean dry weight subtracts bag tare and remains an estimate", () => {
  assert.equal(estimateTowels(5200, 200, 50), 100);
  assert.equal(estimateTowels(5220, 200, 50), 100);
  assert.equal(estimateTowels(5230, 200, 50), 101);
  assert.throws(() => estimateTowels(100, 200, 50));
  assert.throws(() => estimateTowels(5200, 200, 0));
});
test("weekly billing uses validated Monday civil dates", () => {
  assert.equal(serviceWeek("2026-10-19"), "2026-10-19");
  assert.throws(() => serviceWeek("2026-10-20"));
  assert.throws(() => serviceWeek("2026-02-30"));
  assert.throws(() => serviceWeek("10/19/2026"));
});
