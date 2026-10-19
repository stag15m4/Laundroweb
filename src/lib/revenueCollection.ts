import { prisma } from "@/lib/prisma";
import {
  fascardConfigured,
  fascardLocationId,
  fascardRecentTransactions,
  TURN_TRANS_TYPE,
  TURN_TRANS_SUBTYPE,
} from "@/lib/fascard";

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

export type CategoryTotals = {
  cash: number;
  card: number;
  machines: { id: string; name: string; fascardMachNo: number; cash: number; card: number }[];
};

export type FascardCategoryResult = {
  configured: boolean;
  error: string | null;
  washer: CategoryTotals;
  dryer: CategoryTotals;
};

const emptyCategory = (): CategoryTotals => ({ cash: 0, card: 0, machines: [] });

/**
 * Sums FasCard-reported revenue for reader-equipped washers and dryers over
 * [sinceUTC, untilUTC), split by tender (CashAmount vs CreditCardAmount).
 *
 * Only TransType 100 / SubType 0 ("Vend sale" / machine start) is counted --
 * the same restriction turns-per-day uses. SubType 1 (credit card surcharge)
 * and SubType 2 (point of sale) are left out deliberately: a surcharge line
 * item isn't confirmed to always represent new money collected here, and
 * point-of-sale transactions likely belong to vending, which is tracked as
 * its own category -- including them here would risk double-counting.
 *
 * Machines with no fascardMachNo are coin-only and have no FasCard data at
 * all; their revenue comes from the weighed-coin side of the collection
 * tool instead, not from this function.
 */
export async function fascardCategoryTotals(
  sinceUTC: Date,
  untilUTC: Date
): Promise<FascardCategoryResult> {
  if (!fascardConfigured()) {
    return { configured: false, error: null, washer: emptyCategory(), dryer: emptyCategory() };
  }

  const machines = await prisma.machine.findMany({
    where: { type: { in: ["WASHER", "DRYER"] }, fascardMachNo: { not: null } },
    select: { id: true, name: true, type: true, fascardMachNo: true },
  });

  if (machines.length === 0) {
    return { configured: true, error: null, washer: emptyCategory(), dryer: emptyCategory() };
  }

  const byMachNo = new Map(machines.map((m) => [m.fascardMachNo as number, m]));
  const locationId = Number(fascardLocationId());

  const washer = emptyCategory();
  const dryer = emptyCategory();

  try {
    const { transactions, diagnostics } = await fascardRecentTransactions(sinceUTC, untilUTC);

    // A capped fetch means the walk back through FasCard's pages stopped
    // before reaching sinceUTC -- the transactions returned are an unknown
    // subset of what actually happened in the window, not an empty tail.
    // Saving totals built from that would silently under-report revenue and
    // (worse) advance the collection cursor past dates that were never
    // actually fully counted. Treat it as a hard failure instead: the caller
    // needs a narrower date range, not a partial answer.
    if (diagnostics.hitPageCap) {
      return {
        configured: true,
        error: `FasCard returned too many transactions to walk back to ${sinceUTC.toISOString().slice(0, 10)} (hit the ${diagnostics.pagesFetched}-page safety cap). Try a shorter date range.`,
        washer: emptyCategory(),
        dryer: emptyCategory(),
      };
    }

    const perMachine = new Map<number, { cash: number; card: number }>();
    for (const t of transactions) {
      if (t.TransType !== TURN_TRANS_TYPE || t.TransSubType !== TURN_TRANS_SUBTYPE) continue;
      if (t.LocationID !== locationId) continue;
      if (t.MachNo === null || !byMachNo.has(t.MachNo)) continue;

      const running = perMachine.get(t.MachNo) ?? { cash: 0, card: 0 };
      running.cash += t.CashAmount ?? 0;
      running.card += t.CreditCardAmount ?? 0;
      perMachine.set(t.MachNo, running);
    }

    for (const machine of machines) {
      const totals = perMachine.get(machine.fascardMachNo as number) ?? { cash: 0, card: 0 };
      const bucket = machine.type === "DRYER" ? dryer : washer;
      bucket.cash += totals.cash;
      bucket.card += totals.card;
      bucket.machines.push({
        id: machine.id,
        name: machine.name,
        fascardMachNo: machine.fascardMachNo as number,
        cash: totals.cash,
        card: totals.card,
      });
    }

    return { configured: true, error: null, washer, dryer };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error fetching FasCard transactions";
    return { configured: true, error: message, washer: emptyCategory(), dryer: emptyCategory() };
  }
}
