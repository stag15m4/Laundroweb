/**
 * Content values in `site.ts` that have not been filled in yet are prefixed
 * with "TODO:". These helpers let the site degrade gracefully instead of
 * printing the word "TODO" to customers — and, importantly, keep placeholder
 * values out of the structured data we hand to search engines. Publishing a
 * fake address as machine-readable LocalBusiness data is much harder to walk
 * back than a typo in body copy.
 */

export function isPlaceholder(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trimStart().startsWith("TODO:");
}

/** Returns the value, or `fallback` when it is still a placeholder. */
export function orFallback(value: string, fallback: string): string {
  return isPlaceholder(value) ? fallback : value;
}

/** Returns the value, or `undefined` when it is still a placeholder. */
export function orUndefined(value: string | null | undefined): string | undefined {
  return !value || isPlaceholder(value) ? undefined : value;
}

/** Strips the "TODO: " prefix so placeholders still read naturally on screen. */
export function display(value: string): string {
  return isPlaceholder(value) ? value.replace(/^\s*TODO:\s*/, "") : value;
}

/**
 * Pluralizes a noun for a count.
 *
 * Takes `count` as a plain `number` on purpose: the content arrays are declared
 * `as const`, which narrows counts to literal types like `2 | 6 | 5`. Comparing
 * those against 1 inline is a type error, and widening here is cleaner than
 * loosening the const assertion on the content itself.
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm ?? `${singular}s`;
}

/**
 * Builds a `tel:` href. Placeholder values get their "TODO: " prefix stripped
 * so the markup stays syntactically valid before launch, and whitespace and
 * formatting characters are removed so dialers handle it correctly.
 */
export function telHref(value: string): string {
  return `tel:${display(value).replace(/[^\d+]/g, "")}`;
}

/** Builds a `mailto:` href, with an optional subject line. */
export function mailtoHref(value: string, subject?: string): string {
  const address = display(value);
  return subject
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}`
    : `mailto:${address}`;
}
