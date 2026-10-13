import { test } from "node:test";
import assert from "node:assert/strict";
import { validDate, nextDueDate, validateDeadline } from "../src/lib/compliance";
test("civil dates reject impossible days and timestamps", () => {
  assert.equal(validDate("2027-10-27"), true);
  for (const date of ["2027-02-29", "2027-04-31", "2027-10-27T00:00:00Z", "garbage"]) assert.equal(validDate(date), false);
});
test("monthly and leap-year renewals clamp to the target month", () => {
  assert.equal(nextDueDate("2027-01-31", "monthly"), "2027-02-28");
  assert.equal(nextDueDate("2028-02-29", "yearly"), "2029-02-28");
  assert.equal(nextDueDate("2027-10-27", "yearly"), "2028-10-27");
});
test("deadline validation ignores injected fields and validates classification", () => {
  const row = { title:" PCI compliance ",dueDate:"2027-10-27",deadlineType:"pci_compliance",recurrence:"yearly",status:"completed" };
  const clean = validateDeadline(row);
  assert.equal(clean.title,"PCI compliance");
  assert.equal("status" in clean,false);
  assert.throws(() => validateDeadline({...row,dueDate:"2027-02-30"}));
  assert.throws(() => validateDeadline({...row,recurrence:"bogus"}));
});
