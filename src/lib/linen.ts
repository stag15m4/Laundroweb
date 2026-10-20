
import { WdfError, integer } from "./wdf-pricing";

export type Movement = {
  towelsOut: number; towelsIn: number; towelsLost: number;
  bagsOut: number; bagsIn: number; bagsLost: number;
  towelAdjustment: number; bagAdjustment: number;
};
export function balance(rows: Movement[]) {
  return rows.reduce((b, r) => ({
    towels: b.towels + r.towelsOut - r.towelsIn - r.towelsLost + r.towelAdjustment,
    bags: b.bags + r.bagsOut - r.bagsIn - r.bagsLost + r.bagAdjustment,
  }), { towels: 0, bags: 0 });
}
export function applyMovement(current: { towels: number; bags: number }, row: Movement) {
  const b = balance([row]);
  const next = { towels: current.towels + b.towels, bags: current.bags + b.bags };
  integer(next.towels, "Towels outstanding", 0, 1000000);
  integer(next.bags, "Bags outstanding", 0, 1000000);
  return next;
}
export function estimateTowels(grossGrams: number, tareGrams: number, towelGrams: number) {
  integer(grossGrams, "Gross weight in grams", 1, 1000000);
  integer(tareGrams, "Bag tare in grams", 0, 1000000);
  integer(towelGrams, "Calibrated towel weight in grams", 1, 10000);
  if (grossGrams <= tareGrams) throw new WdfError("Gross weight must exceed the combined bag tare.");
  return integer(Math.round((grossGrams - tareGrams) / towelGrams), "Estimated clean towels", 1, 100000);
}
export function serviceWeek(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WdfError("Select the Monday starting the service week.");
  const d = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value || d.getUTCDay() !== 1)
    throw new WdfError("Service week must be a valid Monday.");
  return value;
}
