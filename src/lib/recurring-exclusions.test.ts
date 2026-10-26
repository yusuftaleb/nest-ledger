import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRecurringExclusions } from "./recurring-exclusions.ts";

test("saved exclusions match future merchant variants and respect account scope", () => {
  const rows = [
    { merchant: "COSTCO  GAS W1578 VANCOUVER BC", account_id: "card" },
    { merchant: "COSTCO WHOLESALE W1578 VANCOUVER BC", account_id: "card" },
    { merchant: "Costco Gas new location", account_id: "other-card" },
  ];
  const scoped = applyRecurringExclusions(rows, [{ merchant: "Costco Gas", account_id: "card" }, { merchant: "  ", account_id: null }]);
  assert.deepEqual(scoped.map((r) => r.exclude_from_recurring === true), [true, false, false]);
  const allAccounts = applyRecurringExclusions(rows, [{ merchant: "Costco Gas", account_id: null }]);
  assert.deepEqual(allAccounts.map((r) => r.exclude_from_recurring === true), [true, false, true]);
  assert.equal("exclude_from_recurring" in rows[0], false);
});
