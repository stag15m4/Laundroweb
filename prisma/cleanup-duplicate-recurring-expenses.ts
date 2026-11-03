import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * One-time cleanup for a bug in generateDueRecurringExpenses (shipped in
 * the Recurring Expense feature, fixed alongside this script): its
 * catch-up loop started from the date that was already generated last
 * time, rather than the occurrence after it. Since an already-generated
 * date is always in the past, this re-created that same occurrence on
 * every single call -- i.e. on every load of the Expenses or Reports
 * page -- for as long as the template stayed active, with no bound.
 *
 * The signature is exact and safe to automate: generation only ever
 * creates one Expense row per (recurringExpenseId, date) pair by design
 * -- distinct periods always land on distinct dates -- so two or more
 * rows sharing both is never a legitimate double payment, only ever this
 * bug. For each such group this keeps the single earliest-created row
 * (preserving the real audit trail) and deletes the rest. Expense rows
 * with no recurringExpenseId (hand-entered) are never touched.
 *
 * Usage:
 *   npx tsx prisma/cleanup-duplicate-recurring-expenses.ts --dry-run   # preview only
 *   npx tsx prisma/cleanup-duplicate-recurring-expenses.ts             # apply
 */
async function main() {
  const rows = await prisma.expense.findMany({
    where: { recurringExpenseId: { not: null } },
    select: { id: true, recurringExpenseId: true, date: true, amount: true, description: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.recurringExpenseId}:${row.date.getTime()}`;
    const g = groups.get(key) ?? [];
    g.push(row);
    groups.set(key, g);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  const idsToDelete = duplicateGroups.flatMap((g) => g.slice(1).map((r) => r.id));
  const duplicateTotal = duplicateGroups.reduce(
    (sum, g) => sum + g.slice(1).reduce((s, r) => s + Number(r.amount), 0),
    0
  );

  console.log(`Expense rows generated from a RecurringExpense template: ${rows.length}`);
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`Duplicate rows to remove: ${idsToDelete.length} (totaling ${duplicateTotal.toFixed(2)})\n`);

  for (const g of duplicateGroups) {
    const kept = g[0];
    console.log(
      `  ${kept.date.toISOString().slice(0, 10)} · ${kept.description} · ${g.length} copies -> keeping 1, ` +
        `removing ${g.length - 1}`
    );
  }

  if (!DRY_RUN && idsToDelete.length > 0) {
    await prisma.expense.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  console.log(DRY_RUN ? "\nDry run only -- nothing was deleted. Re-run without --dry-run to apply." : "\nDone.");
  await prisma.$disconnect();
}

main();
