
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { agreementTerms, agreementDocument, endAfterMonths, civilDate } from "../src/lib/service-agreement";
import { agreementPdf } from "../src/lib/agreement-pdf";
import { contractInput, contractPlan } from "./fixtures/service-agreement";

test("fixed and weekly terms are explicit; service prices come from plan", () => {
  const t = agreementTerms({ ...contractInput, weeklyFeeCents: 1 }, contractPlan);
  assert.equal(t.weeklyFeeCents, 3846);
  const text = agreementDocument(t, 12);
  for (const phrase of ["2027-10-31", "$38.46", "mutual", "sale of substantially all", "replaces service agreement #12", "PROVIDER:", "CUSTOMER:"])
    assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), phrase);
  assert.ok(!text.includes("automatically renews for another fixed term"));
  const weekly = agreementTerms({ ...contractInput, termType: "WEEKLY", endDate: "bad" }, contractPlan);
  assert.equal(weekly.endDate, null); assert.equal(weekly.renewal, "WEEKLY"); assert.equal(weekly.earlyExit, "NOTICE");
  assert.ok(agreementDocument(weekly).includes("week-to-week"));
});
test("dates, pricing and legal entity details are validated", () => {
  assert.equal(agreementTerms({ ...contractInput, providerLegalName: "Wrong company" }, contractPlan).providerLegalName, "Clinton Laundry Works, LLC");
  assert.equal(agreementTerms({ ...contractInput, providerAddress: "Wrong address" }, contractPlan).providerAddress, "540 McKoy St");
  assert.throws(() => agreementTerms({ ...contractInput, endDate: "2026-01-01" }, contractPlan));
  assert.throws(() => agreementTerms({ ...contractInput, providerEmail: "bad" }, contractPlan));
  assert.throws(() => agreementTerms(contractInput, { ...contractPlan, weeklyFeeCents: null }));
  assert.throws(() => civilDate("2026-02-30", "date"));
  assert.equal(endAfterMonths("2026-11-01", 12), "2027-10-31");
  assert.equal(endAfterMonths("2026-11-01", 6), "2027-04-30");
});
test("agreement PDFs paginate, preserve text identity and reject unsupported glyphs", async () => {
  const text = agreementDocument(agreementTerms(contractInput, contractPlan));
  const sha = createHash("sha256").update(text).digest("hex");
  const bytes = await agreementPdf(text, 8, 2, "ISSUED", sha);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2);
  assert.ok(pdf.getPages().every(p => p.getWidth() === 612 && p.getHeight() === 792));
  assert.ok(pdf.getTitle()?.includes("#8 v2"));
  assert.ok(pdf.getSubject()?.includes(sha));
  const long = text + "\n\n" + ("Special negotiated service provision. ".repeat(200));
  const longPdf = await PDFDocument.load(await agreementPdf(long, 9, 3, "DRAFT", sha));
  assert.ok(longPdf.getPageCount() > pdf.getPageCount());
  await assert.rejects(() => agreementPdf(text + " 🧺", 9, 3, "DRAFT", sha), /unsupported characters/);
});
