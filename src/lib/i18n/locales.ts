export type Locale = "en" | "es" | "ht";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ht", label: "Kreyòl" },
];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es" || value === "ht";
}
