import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessDate, periodsOverlap, reportPeriodFromId } from "../src/lib/fascardReportPeriods";

test("accepts valid calendar dates only", () => {
  assert.equal(isBusinessDate("2026-11-21"), true);
  assert.equal(isBusinessDate("2026-02-30"), false);
  assert.equal(isBusinessDate("2026-11-2"), false);
  assert.equal(isBusinessDate(null), false);
});

test("reads legacy daily entries and new immutable range IDs", () => {
  assert.deepEqual(reportPeriodFromId("fascard-daily-2026-11-21"), { start: "2026-11-21", end: "2026-11-21" });
  assert.deepEqual(reportPeriodFromId("fascard-period-2026-11-16_2026-11-21"), { start: "2026-11-16", end: "2026-11-21" });
  assert.equal(reportPeriodFromId("arbitrary-entry"), null);
  assert.equal(reportPeriodFromId("fascard-period-2026-11-21_2026-11-16"), null);
});

test("rejects inclusive overlap, including legacy daily reports, but permits adjacent periods", () => {
  const period = { start: "2026-11-16", end: "2026-11-21" };
  assert.equal(periodsOverlap(period, { start: "2026-11-21", end: "2026-11-21" }), true);
  assert.equal(periodsOverlap(period, { start: "2026-11-15", end: "2026-11-16" }), true);
  assert.equal(periodsOverlap(period, { start: "2026-11-18", end: "2026-11-20" }), true);
  assert.equal(periodsOverlap(period, { start: "2026-11-22", end: "2026-11-28" }), false);
});
