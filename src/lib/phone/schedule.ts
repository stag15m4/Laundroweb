export const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type OnCallDay = { enabled: boolean; start: string; end: string; allDay: boolean };
const time = /^([01]\d|2[0-3]):[0-5]\d$/;
export function parseWeeklySchedule(value: unknown): OnCallDay[] {
  if (!Array.isArray(value) || value.length !== 7) throw new Error("Set an on-call schedule for all seven days.");
  return value.map(day => {
    if (!day || typeof day.enabled !== "boolean" || typeof day.allDay !== "boolean" || typeof day.start !== "string" || typeof day.end !== "string" || !time.test(day.start) || !time.test(day.end) || (day.enabled && !day.allDay && day.start === day.end)) throw new Error("Choose valid hours for each day, or select Off or All day.");
    return { enabled: day.enabled, start: day.start, end: day.end, allDay: day.allDay };
  });
}
export function legacyWeek(start: string, end: string): OnCallDay[] {
  return weekdays.map(() => ({ enabled: true, start, end, allDay: false }));
}
export function weeklyOnCall(schedule: unknown, now: Date): boolean {
  let days: OnCallDay[];
  try { days = parseWeeklySchedule(schedule); } catch { return false; }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const index = weekdays.indexOf(parts.find(p => p.type === "weekday")!.value as typeof weekdays[number]);
  const local = `${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`;
  const today = days[index], yesterday = days[(index + 6) % 7];
  // An overnight shift belongs to its starting day, including Saturday -> Sunday.
  return (today.enabled && (today.allDay || (today.start < today.end ? local >= today.start && local < today.end : local >= today.start)))
    || (yesterday.enabled && !yesterday.allDay && yesterday.start > yesterday.end && local < yesterday.end);
}
