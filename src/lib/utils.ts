import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined) {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A bare "yyyy-MM-dd" has no time part, so Date parses it as UTC midnight --
// rendered back in a viewer's local timezone (as formatDate does), that can
// display as the day before for anyone west of UTC. Appending a local (no
// "Z") time-of-day instead makes Date resolve it as local midnight, which
// round-trips to the same calendar day everywhere.
export function localDateToIso(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toISOString();
}
