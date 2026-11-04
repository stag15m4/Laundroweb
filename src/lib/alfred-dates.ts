import { NextResponse } from "next/server";
import { alfredError } from "@/lib/alfred-write";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AlfredDateRange = { gte?: Date; lt?: Date; lte?: Date };

/**
 * Builds a Prisma date-range filter from Alfred's `from`/`to` query params.
 *
 * `to` is usually a bare calendar date ("2026-10-26") meaning "through the
 * end of that day." `new Date("2026-10-26")` parses to that day's UTC
 * midnight -- the day's *start*, not its end -- so comparing with a plain
 * `lte` against it excludes virtually the whole day for any row whose date
 * carries a real time-of-day. A bare `to` is normalized here to an exclusive
 * upper bound at the start of the next day instead; a `to` that already
 * carries a time is trusted as the exact instant it names.
 *
 * Returns `undefined` when neither param was given (caller omits the date
 * filter entirely), or `null` when one was given but isn't a valid date
 * (caller should surface a 400 instead of silently matching nothing).
 */
export function alfredDateRange(
  from: string | null,
  to: string | null
): AlfredDateRange | null | undefined {
  if (!from && !to) return undefined;

  const range: AlfredDateRange = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) return null;
    range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) return null;
    if (BARE_DATE.test(to)) {
      range.lt = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    } else {
      range.lte = d;
    }
  }
  return range;
}

/** True if y-m-d is a real calendar date (rejects e.g. 2026-02-30). */
function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); // "day 0" of next month = last day of this one
  return d <= daysInMonth;
}

/**
 * Parses a single date field from a write proposal, for a human-readable
 * error on failure. A bare yyyy-MM-dd is read at midday so the calendar date
 * cannot slip a day west of UTC. Calendar components are validated directly
 * rather than trusting Date's rollover behavior, which silently turns e.g.
 * 2026-02-30 into March 2 instead of rejecting it -- a human could approve
 * the summary's February date while the stored value is really in March.
 */
export function parseAlfredDate(
  raw: unknown,
  field: string
): { ok: true; date: Date } | { ok: false; response: NextResponse } {
  const invalid = () =>
    ({
      ok: false as const,
      response: alfredError(400, `invalid_${field}`, `Could not read "${String(raw)}" as a date. Use YYYY-MM-DD.`),
    });

  if (typeof raw !== "string") return invalid();

  if (BARE_DATE.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
    if (!isValidCalendarDate(y, m, d)) return invalid();
    return { ok: true, date: new Date(Date.UTC(y, m - 1, d, 12)) };
  }

  if (Number.isNaN(Date.parse(raw))) return invalid();
  return { ok: true, date: new Date(raw) };
}
