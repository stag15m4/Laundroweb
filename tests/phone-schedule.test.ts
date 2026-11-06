import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyWeek, parseWeeklySchedule, weeklyOnCall } from "../src/lib/phone/schedule";
import { isOnCall } from "../src/lib/phone/core";
test("weekly schedule supports adjustable weekday hours, weekends off and all-day coverage", () => {
  const week = legacyWeek("09:00", "17:00"); week[0].enabled = week[6].enabled = false;
  const active = (stamp: string) => weeklyOnCall(week, new Date(stamp));
  assert.equal(active("2026-11-06T13:59:00Z"), false);
  assert.equal(active("2026-11-06T14:00:00Z"), true);
  assert.equal(active("2026-11-06T22:00:00Z"), false);
  assert.equal(active("2026-11-07T16:00:00Z"), false);
  assert.equal(active("2026-11-08T16:00:00Z"), false);
  assert.equal(active("2026-11-09T14:00:00Z"), true);
  week[6] = { enabled: true, allDay: true, start: "00:00", end: "00:00" };
  assert.equal(active("2026-11-08T04:59:00Z"), true);
  assert.equal(active("2026-11-08T05:00:00Z"), false);
});
test("overnight coverage carries only from the previous scheduled day, including week rollover", () => {
  const week = legacyWeek("22:00", "02:00"); week.forEach(d => d.enabled = false); week[6].enabled = true;
  assert.equal(weeklyOnCall(week, new Date("2026-11-07T06:00:00Z")), false);
  assert.equal(weeklyOnCall(week, new Date("2026-11-08T04:00:00Z")), true);
  assert.equal(weeklyOnCall(week, new Date("2026-11-08T06:59:00Z")), true);
  assert.equal(weeklyOnCall(week, new Date("2026-11-08T07:00:00Z")), false);
});
test("weekly schedule follows Eastern daylight saving and rejects malformed coverage", () => {
  const week = legacyWeek("01:00", "03:00");
  assert.equal(weeklyOnCall(week, new Date("2026-11-01T05:30:00Z")), true);
  assert.equal(weeklyOnCall(week, new Date("2026-11-01T06:30:00Z")), true);
  assert.equal(weeklyOnCall(week, new Date("2026-11-01T08:00:00Z")), false);
  assert.throws(() => parseWeeklySchedule([]));
  assert.throws(() => parseWeeklySchedule(week.map(d => ({ ...d, start: "03:00" }))));
  assert.equal(weeklyOnCall({}, new Date()), false);
  const config = { onCallHoursEnabled: true, onCallStart: "09:00", onCallEnd: "17:00", weeklySchedule: null };
  assert.equal(isOnCall(config, new Date("2026-11-07T16:00:00Z")), true); // Legacy daily coverage retained.
  assert.equal(isOnCall({ ...config, weeklySchedule: [] }, new Date()), false);
  assert.equal(isOnCall({ ...config, onCallHoursEnabled: false, weeklySchedule: [] }, new Date()), true);
});
