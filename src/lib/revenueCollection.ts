/**
 * A modern clad quarter is 5.670 g / 0.200 oz per the US Mint's own spec,
 * manufactured to a tight tolerance -- worn coins lose a trace of mass, not
 * enough to matter at these volumes. Pre-1965 90% silver quarters (6.25 g)
 * are rare enough in circulation today to ignore; one showing up is a
 * rounding error, not a pattern.
 */
export const GRAMS_PER_DOLLAR = 22.68;
export const OUNCES_PER_DOLLAR = 0.8;

export type WeightUnit = "g" | "oz";

export function coinWeightToDollars(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Coin weight must be a non-negative number.");
  }
  const perDollar = unit === "g" ? GRAMS_PER_DOLLAR : OUNCES_PER_DOLLAR;
  return value / perDollar;
}
