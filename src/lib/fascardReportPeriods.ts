export type ReportPeriod = { start: string; end: string };

export function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reportPeriodFromId(id: string): ReportPeriod | null {
  const daily = /^fascard-daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  const range = /^fascard-period-(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(id);
  const start = daily?.[1] ?? range?.[1];
  const end = daily?.[1] ?? range?.[2];
  return isBusinessDate(start) && isBusinessDate(end) && start <= end ? { start, end } : null;
}

export function periodsOverlap(a: ReportPeriod, b: ReportPeriod): boolean {
  return a.start <= b.end && b.start <= a.end;
}
