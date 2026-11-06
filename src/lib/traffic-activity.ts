// Provisional webhook activity bands, not occupancy or a learned customer baseline.
export const TRAFFIC_WINDOW_MS = 60 * 60 * 1000;
export const TRAFFIC_LEVELS = ["Dead", "Slow", "Average", "Busy"] as const;
export function trafficLevel(events: number): typeof TRAFFIC_LEVELS[number] {
  if (events >= 10) return "Busy";
  if (events >= 4) return "Average";
  if (events >= 1) return "Slow";
  return "Dead";
}
