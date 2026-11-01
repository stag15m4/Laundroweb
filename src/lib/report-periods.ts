import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  format,
  getDaysInMonth,
  isSameYear,
} from "date-fns";

export type PeriodType = "day" | "week" | "month" | "year";

// start inclusive, end exclusive -- a record falls in range when
// start <= date < end, which sidesteps end-of-day rounding entirely.
export type DateRange = { start: Date; end: Date };

export function getPeriodRange(type: PeriodType, anchor: Date): DateRange {
  switch (type) {
    case "day": {
      const start = startOfDay(anchor);
      return { start, end: addDays(start, 1) };
    }
    case "week": {
      const start = startOfWeek(anchor);
      return { start, end: addWeeks(start, 1) };
    }
    case "month": {
      const start = startOfMonth(anchor);
      return { start, end: addMonths(start, 1) };
    }
    case "year": {
      const start = startOfYear(anchor);
      return { start, end: addYears(start, 1) };
    }
  }
}

/** Moves the anchor one whole period forward (positive) or back (negative). */
export function shiftAnchor(type: PeriodType, anchor: Date, direction: 1 | -1): Date {
  const amount = direction;
  switch (type) {
    case "day":
      return direction > 0 ? addDays(anchor, amount) : subDays(anchor, -amount);
    case "week":
      return direction > 0 ? addWeeks(anchor, amount) : subWeeks(anchor, -amount);
    case "month":
      return direction > 0 ? addMonths(anchor, amount) : subMonths(anchor, -amount);
    case "year":
      return direction > 0 ? addYears(anchor, amount) : subYears(anchor, -amount);
  }
}

export function formatPeriodLabel(type: PeriodType, anchor: Date): string {
  const { start } = getPeriodRange(type, anchor);
  switch (type) {
    case "day":
      return format(start, "EEE, MMM d, yyyy");
    case "week":
      return `Week of ${format(start, "MMM d, yyyy")}`;
    case "month":
      return format(start, "MMMM yyyy");
    case "year":
      return format(start, "yyyy");
  }
}

export type ComparisonOption = { key: string; label: string; range: DateRange };

/**
 * The comparison choices offered for a given period type, mirroring the
 * options a Square-style report offers: for a single day, "prior day"
 * compares to the same weekday a week back (retail traffic on a Sunday
 * isn't comparable to a Monday), not literally yesterday.
 */
export function getComparisonOptions(type: PeriodType, anchor: Date): ComparisonOption[] {
  const { start: periodStart } = getPeriodRange(type, anchor);

  function rangeFor(shiftedAnchor: Date): DateRange {
    return getPeriodRange(type, shiftedAnchor);
  }

  switch (type) {
    case "day": {
      const priorWeekAnchor = subWeeks(periodStart, 1);
      return [
        { key: "prior-week", label: `Prior ${format(priorWeekAnchor, "EEEE")}`, range: rangeFor(priorWeekAnchor) },
        { key: "4-weeks-prior", label: "4 weeks prior", range: rangeFor(subWeeks(periodStart, 4)) },
        { key: "52-weeks-prior", label: "52 weeks prior", range: rangeFor(subWeeks(periodStart, 52)) },
        { key: "prior-year", label: "Prior year", range: rangeFor(subYears(periodStart, 1)) },
      ];
    }
    case "week":
      return [
        { key: "prior-week", label: "Prior week", range: rangeFor(subWeeks(periodStart, 1)) },
        { key: "4-weeks-prior", label: "4 weeks prior", range: rangeFor(subWeeks(periodStart, 4)) },
        { key: "52-weeks-prior", label: "52 weeks prior", range: rangeFor(subWeeks(periodStart, 52)) },
        { key: "prior-year", label: "Prior year", range: rangeFor(subYears(periodStart, 1)) },
      ];
    case "month":
      return [
        { key: "prior-month", label: "Prior month", range: rangeFor(subMonths(periodStart, 1)) },
        { key: "prior-year", label: "Prior year", range: rangeFor(subYears(periodStart, 1)) },
      ];
    case "year":
      return [
        { key: "prior-year", label: "Prior year", range: rangeFor(subYears(periodStart, 1)) },
        { key: "2-years-prior", label: "2 years prior", range: rangeFor(subYears(periodStart, 2)) },
        { key: "3-years-prior", label: "3 years prior", range: rangeFor(subYears(periodStart, 3)) },
      ];
  }
}

export type Bucket = { label: string; range: DateRange };

/**
 * Buckets for the period's bar chart. No buckets for "day" -- Laundroweb's
 * revenue comes from periodic cash/card pulls logged on whatever date the
 * pull happened, not a continuous per-transaction feed, so an hourly
 * breakdown of a single day would just show one spike at whatever time the
 * entry was saved rather than anything meaningful.
 */
export function getChartBuckets(type: PeriodType, anchor: Date): Bucket[] {
  const { start } = getPeriodRange(type, anchor);
  switch (type) {
    case "day":
      return [];
    case "week":
      return Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i);
        return { label: format(day, "EEE"), range: { start: day, end: addDays(day, 1) } };
      });
    case "month": {
      const days = getDaysInMonth(start);
      return Array.from({ length: days }, (_, i) => {
        const day = addDays(start, i);
        return { label: format(day, "d"), range: { start: day, end: addDays(day, 1) } };
      });
    }
    case "year":
      return Array.from({ length: 12 }, (_, i) => {
        const month = addMonths(start, i);
        return { label: format(month, "MMM"), range: { start: month, end: addMonths(month, 1) } };
      });
  }
}

export function inRange(date: Date | string, range: DateRange): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return d >= range.start && d < range.end;
}

/** A short label for an arbitrary custom comparison range, e.g. for the
 * "Compare" picker's summary once a custom range has been chosen. */
export function formatRangeLabel(range: DateRange): string {
  const end = subDays(range.end, 1);
  if (isSameYear(range.start, end)) {
    return `${format(range.start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(range.start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
}
