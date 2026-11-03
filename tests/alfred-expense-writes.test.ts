import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Explicit opt-in: these tests create and delete Expense/RecurringExpense
// rows in a throwaway DB. Contract tests for the propose/confirm write path
// Alfred uses -- see docs/ALFRED_API_CONVENTIONS.md and
// docs/ALFRED_API_IMPLEMENTATION_NOTES.md ("Add meaningful contract tests
// when implementing endpoints; documentation alone is not an audit of
// existing endpoints.").
const TOKEN = "alfred-expense-writes-test-token";

function post(url: string, body: Record<string, unknown>, token: string | null = TOKEN) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-alfred-token": token } : {}),
    },
  });
}

test(
  "Alfred one-off expense writes",
  { skip: !process.env.ALFRED_EXPENSE_TEST_DATABASE_URL },
  async (t) => {
    const savedEnv = { ...process.env };
    process.env.DATABASE_URL = process.env.ALFRED_EXPENSE_TEST_DATABASE_URL;
    process.env.ALFRED_SERVICE_TOKEN = TOKEN;
    const { prisma } = await import("../src/lib/prisma");
    const { POST } = await import("../src/app/api/alfred/expenses/route");
    const url = "https://example.com/api/alfred/expenses";
    const createdIds: string[] = [];

    try {
      await t.test("rejects a missing or wrong token", async () => {
        assert.equal((await POST(post(url, {}, null))).status, 401);
        assert.equal((await POST(post(url, {}, "wrong"))).status, 401);
      });

      await t.test("propose validates but writes nothing", async () => {
        const before = await prisma.expense.count();
        const res = await POST(
          post(url, {
            date: "2027-01-15",
            category: "Repairs",
            description: "Dryer belt replacement",
            amount: 245,
            vendor: "Acme Parts Co",
          })
        );
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.status, "proposed");
        assert.match(body.summary, /\$245\.00 Repairs expense from Acme Parts Co/);
        assert.equal(await prisma.expense.count(), before, "propose must not write");
      });

      await t.test("confirm performs the write exactly once", async () => {
        const proposeRes = await POST(
          post(url, { date: "2027-01-16", category: "Supplies", description: "Detergent restock", amount: 60 })
        );
        const { confirmationToken } = await proposeRes.json();

        const before = await prisma.expense.count();
        const confirmRes = await POST(post(url, { confirmationToken }));
        const confirmBody = await confirmRes.json();
        assert.equal(confirmRes.status, 200);
        assert.equal(confirmBody.status, "confirmed");
        assert.equal(confirmBody.record.amount, 60);
        createdIds.push(confirmBody.expenseId);
        assert.equal(await prisma.expense.count(), before + 1);

        // Confirming the same token again must not create a second row.
        const secondConfirm = await POST(post(url, { confirmationToken }));
        assert.equal(secondConfirm.status, 409);
        assert.equal(await prisma.expense.count(), before + 1, "a reused token must not double-write");
      });

      await t.test("rejects a non-positive amount", async () => {
        const res = await POST(
          post(url, { date: "2027-01-15", category: "Repairs", description: "Test", amount: 0 })
        );
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "invalid_amount");
      });
    } finally {
      await prisma.expense.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.$disconnect();
      process.env = savedEnv;
    }
  }
);

test(
  "Alfred recurring expense writes",
  { skip: !process.env.ALFRED_EXPENSE_TEST_DATABASE_URL },
  async (t) => {
    const savedEnv = { ...process.env };
    process.env.DATABASE_URL = process.env.ALFRED_EXPENSE_TEST_DATABASE_URL;
    process.env.ALFRED_SERVICE_TOKEN = TOKEN;
    const { prisma } = await import("../src/lib/prisma");
    const { POST } = await import("../src/app/api/alfred/recurring-expenses/route");
    const url = "https://example.com/api/alfred/recurring-expenses";
    const createdIds: string[] = [];

    try {
      await t.test("rejects a missing or wrong token", async () => {
        assert.equal((await POST(post(url, {}, null))).status, 401);
      });

      await t.test("propose validates but writes nothing, and reports the frequency plainly", async () => {
        const before = await prisma.recurringExpense.count();
        const res = await POST(
          post(url, {
            category: "Pest Control",
            description: "Quarterly treatment",
            amount: 85,
            frequency: "monthly",
            startDate: "2027-02-01",
            vendor: "Acme Pest Co",
          })
        );
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.status, "proposed");
        assert.match(body.summary, /\$85\.00, monthly, starting 2027-02-01, from Acme Pest Co/);
        assert.equal(await prisma.recurringExpense.count(), before, "propose must not write");
      });

      await t.test("confirm creates the template, with no Expense row yet", async () => {
        const proposeRes = await POST(
          post(url, {
            category: "Insurance",
            description: "Annual liability premium",
            amount: 600,
            frequency: "YEARLY",
            startDate: "2027-03-01",
          })
        );
        const { confirmationToken } = await proposeRes.json();

        const confirmRes = await POST(post(url, { confirmationToken }));
        const confirmBody = await confirmRes.json();
        assert.equal(confirmRes.status, 200);
        assert.equal(confirmBody.status, "confirmed");
        assert.equal(confirmBody.record.frequency, "YEARLY");
        createdIds.push(confirmBody.recurringExpenseId);

        const expenseCount = await prisma.expense.count({
          where: { recurringExpenseId: confirmBody.recurringExpenseId },
        });
        assert.equal(expenseCount, 0, "creating the template must not itself generate an Expense row");
      });

      await t.test("rejects an unknown frequency", async () => {
        const res = await POST(
          post(url, { category: "Rent / Lease", description: "Rent", amount: 1800, frequency: "DAILY", startDate: "2027-01-01" })
        );
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, "invalid_frequency");
      });
    } finally {
      await prisma.recurringExpense.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.$disconnect();
      process.env = savedEnv;
    }
  }
);
