/**
 * The usage-unit vocabulary the dashboard's Usage Unit dropdown offers per
 * utility type (Equipment → Utilities "Add Bill" / "Edit" form). Shared with
 * Alfred's write validation so a bill it logs always matches one of these
 * exactly -- otherwise it saves fine but then shows no selection in that
 * dropdown, since the <Select> there matches by exact string.
 */
export const UTILITY_UNITS: Record<string, string[]> = {
  ELECTRIC: ["kWh"],
  WATER: ["gal", "CCF", "HCF"],
  GAS: ["CCF", "MCF", "Therm"],
  SEWER: ["gal", "CCF"],
};

/**
 * Full words for an abbreviated canonical unit -- not caught by the simple
 * case/trailing-"s" fold below, since e.g. "gallon" doesn't become "gal" by
 * dropping a letter. docs/alfred-write-api.md documents "gallons" itself as
 * an example usageUnit, so it must resolve here, not just "gal"/"GAL".
 */
const ALIASES: Record<string, string> = { gallon: "gal", gallons: "gal" };

/**
 * Matches `raw` against this type's unit list, ignoring case, a trailing
 * "s" (a real gas bill prints "Therms"; the dropdown's value is "Therm"),
 * and the full-word aliases above -- none of the canonical units end in
 * "s" already, so stripping one never collides two different units
 * together. Returns the canonical form to store, or null if nothing for
 * this type matches.
 */
export function normalizeUsageUnit(type: string, raw: string): string | null {
  const units = UTILITY_UNITS[type];
  if (!units) return null;
  const fold = (s: string) => s.trim().toLowerCase().replace(/s$/, "");
  const lower = raw.trim().toLowerCase();
  const target = fold(ALIASES[lower] ?? lower);
  return units.find((u) => fold(u) === target) ?? null;
}
