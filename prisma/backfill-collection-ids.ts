import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * One-time backfill: gives pre-existing RevenueEntry/CoinChangerLog rows
 * (saved before collectionId existed) the same grouping that Collect
 * Quarters and Collect Vending Revenue now give every new submission, so
 * historical pulls show up on the Revenue page as one total too, not one
 * row per machine.
 *
 * Every row one collection submission writes shares the exact same `date`
 * -- it's literally the same `periodEnd` Date object reused for each row in
 * that one request (see /api/revenue/collect and /api/vending/collect) --
 * so two or more RevenueEntry rows sharing an exact instant are, for all
 * practical purposes, certain evidence of one real pull. A lone row with no
 * sibling at that instant is left alone, exactly like a manually-added
 * single entry already behaves today; this script has no way to tell "a
 * one-machine collection round" apart from "someone used Add Entry once",
 * and would rather under-group than invent a batch that may not have
 * existed.
 *
 * Vending and washer/dryer rows are never merged into the same group even
 * if they happen to share a timestamp coincidentally, matching how a real
 * submission always writes rows of only one kind. A coin changer log row
 * joins a washer/dryer group at the same instant -- including a
 * *single*-entry group, since a matching changer log is itself strong
 * independent evidence a real Collect Quarters round happened right then
 * (changer logs are never created any other way).
 *
 * Only ever touches rows where collectionId IS NULL, so it's safe to run
 * more than once: nothing left to backfill on a second run is a no-op.
 *
 * Usage:
 *   npx tsx prisma/backfill-collection-ids.ts --dry-run   # preview only
 *   npx tsx prisma/backfill-collection-ids.ts             # apply
 */
async function main() {
  const entries = await prisma.revenueEntry.findMany({
    where: { collectionId: null },
    select: { id: true, date: true, source: true },
  });
  const changerLogs = await prisma.coinChangerLog.findMany({
    where: { collectionId: null },
    select: { id: true, date: true },
  });

  type Group = { ids: string[]; dateMs: number; isVending: boolean };
  const groups = new Map<string, Group>();
  for (const e of entries) {
    const isVending = e.source === "VENDING";
    const dateMs = e.date.getTime();
    const key = `${isVending ? "v" : "q"}:${dateMs}`;
    const g = groups.get(key) ?? { ids: [], dateMs, isVending };
    g.ids.push(e.id);
    groups.set(key, g);
  }

  const changerByDate = new Map<number, string>();
  for (const c of changerLogs) changerByDate.set(c.date.getTime(), c.id);

  const batches = [...groups.values()].filter(
    (g) => g.ids.length >= 2 || (!g.isVending && changerByDate.has(g.dateMs))
  );
  const groupedEntryCount = batches.reduce((s, b) => s + b.ids.length, 0);

  console.log(`RevenueEntry rows with no collectionId: ${entries.length}`);
  console.log(`CoinChangerLog rows with no collectionId: ${changerLogs.length}`);
  console.log(`Reconstructed ${batches.length} historical pull(s), covering ${groupedEntryCount} entry row(s).`);
  console.log(`${entries.length - groupedEntryCount} row(s) have no matching sibling and will stay ungrouped.\n`);

  let matchedChangerLogs = 0;
  for (const batch of batches) {
    const collectionId = randomUUID();
    const changerMatch = !batch.isVending ? changerByDate.get(batch.dateMs) : undefined;
    console.log(
      `  ${new Date(batch.dateMs).toISOString()} · ${batch.isVending ? "vending" : "washers/dryers"} · ` +
        `${batch.ids.length} entr${batch.ids.length === 1 ? "y" : "ies"}` +
        `${changerMatch ? " + 1 changer log" : ""} -> ${collectionId}`
    );
    if (changerMatch) matchedChangerLogs++;
    if (DRY_RUN) continue;

    await prisma.revenueEntry.updateMany({ where: { id: { in: batch.ids } }, data: { collectionId } });
    if (changerMatch) {
      await prisma.coinChangerLog.update({ where: { id: changerMatch }, data: { collectionId } });
    }
  }

  const orphanChangerLogs = changerLogs.length - matchedChangerLogs;
  if (orphanChangerLogs > 0) {
    console.log(
      `\n${orphanChangerLogs} coin changer log row(s) didn't line up with a reconstructed pull and are left as-is.`
    );
  }

  console.log(DRY_RUN ? "\nDry run only -- nothing was written. Re-run without --dry-run to apply." : "\nDone.");
  await prisma.$disconnect();
}

main();
