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
