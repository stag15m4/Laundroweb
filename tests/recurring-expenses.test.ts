import { test } from "node:test";
import assert from "node:assert/strict";

// Explicit opt-in: this test creates and deletes RecurringExpense/Expense
// rows in a throwaway DB. It is the regression test for a real bug that
// shipped and ran in production for a day: generateDueRecurringExpenses
// re-created the most recently generated occurrence on every single call
// (any call at all, not just a concurrent one) because its loop started
// from lastGeneratedDate itself -- a date that, having already been
// generated, is always <= now -- instead of the occurrence after it.
test(
  "recurring expense generation",
  { skip: !process.env.RECURRING_EXPENSE_TEST_DATABASE_URL },
  async (t) => {
    const savedEnv = { ...process.env };
    process.env.DATABASE_URL = process.env.RECURRING_EXPENSE_TEST_DATABASE_URL;
    const { prisma } = await import("../src/lib/prisma");
    const { generateDueRecurringExpenses } = await import("../src/lib/recurringExpenses");

    const jan1 = new Date("2027-01-01T00:00:00.000Z");
    const feb1 = new Date("2027-02-01T00:00:00.000Z");
    const mar1 = new Date("2027-03-01T00:00:00.000Z");
    const apr1 = new Date("2027-04-01T00:00:00.000Z");

    const template = await prisma.recurringExpense.create({
      data: {
        category: "Rent / Lease",
        description: "Test rent",
        amount: 100,
        frequency: "MONTHLY",
        startDate: jan1,
      },
    });

    try {
      await t.test("first run catches up every occurrence through now", async () => {
        await generateDueRecurringExpenses(mar1);
        const rows = await prisma.expense.findMany({
          where: { recurringExpenseId: template.id },
          orderBy: { date: "asc" },
        });
        assert.deepEqual(
          rows.map((r) => r.date.toISOString()),
          [jan1.toISOString(), feb1.toISOString(), mar1.toISOString()],
        );
      });

      await t.test("calling again with the same `now` does not duplicate the last occurrence", async () => {
        await generateDueRecurringExpenses(mar1);
        const rows = await prisma.expense.findMany({ where: { recurringExpenseId: template.id } });
        assert.equal(rows.length, 3, "a repeat call at the same instant must not add a 4th row");
      });

      await t.test("a later call only adds the occurrence that has newly come due", async () => {
        await generateDueRecurringExpenses(apr1);
        const rows = await prisma.expense.findMany({
          where: { recurringExpenseId: template.id },
          orderBy: { date: "asc" },
        });
        assert.deepEqual(
          rows.map((r) => r.date.toISOString()),
          [jan1.toISOString(), feb1.toISOString(), mar1.toISOString(), apr1.toISOString()],
        );
      });
    } finally {
      await prisma.expense.deleteMany({ where: { recurringExpenseId: template.id } });
      await prisma.recurringExpense.delete({ where: { id: template.id } });
      await prisma.$disconnect();
      process.env = savedEnv;
    }
  },
);
