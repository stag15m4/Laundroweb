// Provisional webhook activity bands, not occupancy or a learned customer baseline.
// Find local midnight using the offset at that midnight (including DST changes).
export function trafficDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const midnight = Date.UTC(part("year"), part("month") - 1, part("day"));
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "longOffset",
  }).formatToParts(new Date(midnight + 5 * 60 * 60 * 1000)).find(p => p.type === "timeZoneName")!.value;
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)!;
  const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
  return new Date(midnight - minutes * 60 * 1000);
}
export const TRAFFIC_LEVELS = ["Dead", "Slow", "Average", "Busy"] as const;
export function trafficLevel(events: number): typeof TRAFFIC_LEVELS[number] {
  if (events >= 10) return "Busy";
  if (events >= 4) return "Average";
  if (events >= 1) return "Slow";
  return "Dead";
}
