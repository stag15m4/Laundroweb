import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Explicit opt-in: creates and deletes UtilityBill rows in a throwaway DB.
// Regression test for a real data problem: Alfred's utilities write
// accepted any non-empty usageUnit, so a free-text value like "therms" (a
// gas bill's own wording) saved fine but then showed no selection in the
// Utilities page's Usage Unit dropdown, which matches by exact string
// ("Therm" for gas). See docs/ALFRED_API_IMPLEMENTATION_NOTES.md on adding
// contract tests when implementing/changing an endpoint.
const TOKEN = "alfred-utilities-writes-test-token";

function post(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-alfred-token": TOKEN },
  });
}

test(
  "Alfred utility bill usage-unit normalization",
  { skip: !process.env.ALFRED_UTILITIES_TEST_DATABASE_URL },
  async (t) => {
    const savedEnv = { ...process.env };
    process.env.DATABASE_URL = process.env.ALFRED_UTILITIES_TEST_DATABASE_URL;
    process.env.ALFRED_SERVICE_TOKEN = TOKEN;
    const { prisma } = await import("../src/lib/prisma");
    const { POST } = await import("../src/app/api/alfred/utilities/route");
    const url = "https://example.com/api/alfred/utilities";
    const createdIds: string[] = [];

    try {
      await t.test('normalizes a plural, lowercase unit ("therms") to the dashboard\'s exact value ("Therm")', async () => {
        const res = await POST(
          post(url, {
            type: "gas",
            billingPeriodStart: "2027-01-01",
            billingPeriodEnd: "2027-01-31",
            usageAmount: 55,
            usageUnit: "therms",
            cost: 102.05,
          })
        );
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.details.usageUnit, "Therm");
      });

      await t.test('normalizes case only ("kwh") for electric', async () => {
        const res = await POST(
          post(url, {
            type: "electric",
            billingPeriodStart: "2027-01-01",
            billingPeriodEnd: "2027-01-31",
            usageAmount: 500,
            usageUnit: "kwh",
            cost: 90,
          })
        );
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.details.usageUnit, "kWh");
      });

      await t.test("rejects a unit this type does not use", async () => {
        const res = await POST(
          post(url, {
            type: "gas",
            billingPeriodStart: "2027-01-01",
            billingPeriodEnd: "2027-01-31",
            usageAmount: 10,
            usageUnit: "liters",
            cost: 20,
          })
        );
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.error, "invalid_usage_unit");
        assert.match(body.message, /Therm/);
      });

      await t.test("confirm writes the normalized unit, not the raw input", async () => {
        const proposeRes = await POST(
          post(url, {
            type: "water",
            billingPeriodStart: "2027-01-01",
            billingPeriodEnd: "2027-01-31",
            usageAmount: 120,
            usageUnit: "GAL",
            cost: 17.07,
          })
        );
        const { confirmationToken } = await proposeRes.json();
        const confirmRes = await POST(post(url, { confirmationToken }));
        const confirmBody = await confirmRes.json();
        assert.equal(confirmRes.status, 200);
        assert.equal(confirmBody.record.usageUnit, "gal");
        createdIds.push(confirmBody.utilityBillId);
      });
    } finally {
      await prisma.utilityBill.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.$disconnect();
      process.env = savedEnv;
    }
  }
);
