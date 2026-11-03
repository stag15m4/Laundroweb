import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stepForward } from "@/lib/recurring-frequency";

// However many occurrences a single catch-up pass will create for one
// template before giving up -- there's no legitimate scenario where a
// weekly rent-like expense goes unvisited for years, so this is just a
// guard against looping forever on bad data, not a real limit in practice.
const MAX_CATCH_UP = 60;

/**
 * Creates any Expense rows that have come due for active RecurringExpense
 * templates since they were last generated, catching up on more than one
 * occurrence if the app went unvisited for a while. Called from
 * GET /api/expenses (so it runs whenever the Expenses or Reports page
 * loads) rather than on a schedule, since this app has no background
 * worker.
 *
 * Each template is generated in its own serializable transaction, so two
 * requests hitting at once can't both read the same lastGeneratedDate and
 * both create the same occurrence twice; a genuine conflict (P2034) just
 * means the other request is handling it, so this one skips that template
 * for now rather than erroring the whole page load.
 */
export async function generateDueRecurringExpenses(now: Date = new Date()): Promise<void> {
  const templates = await prisma.recurringExpense.findMany({ where: { active: true } });

  for (const template of templates) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const current = await tx.recurringExpense.findUnique({ where: { id: template.id } });
          if (!current || !current.active) return;

          // lastGeneratedDate marks an occurrence that was already created --
          // starting `due` there (as this used to) re-creates that same
          // occurrence on every subsequent call, since a past date is always
          // <= now. The next undelivered occurrence is one step past it.
          let due = current.lastGeneratedDate
            ? stepForward(current.lastGeneratedDate, current.frequency)
            : current.startDate;
          let cursor = current.lastGeneratedDate;
          let count = 0;

          while (due.getTime() <= now.getTime() && count < MAX_CATCH_UP) {
            await tx.expense.create({
              data: {
                date: due,
                category: current.category,
                description: current.description,
                amount: current.amount,
                vendor: current.vendor,
                notes: current.notes,
                recurringExpenseId: current.id,
              },
            });
            cursor = due;
            due = stepForward(due, current.frequency);
            count++;
          }

          if (cursor && (!current.lastGeneratedDate || cursor.getTime() !== current.lastGeneratedDate.getTime())) {
            await tx.recurringExpense.update({ where: { id: current.id }, data: { lastGeneratedDate: cursor } });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        continue; // another request is generating this template right now
      }
      throw err;
    }
  }
}
