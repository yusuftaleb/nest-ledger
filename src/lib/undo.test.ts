import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInValue, restorable } from "./undo.ts";

const HOME = "11111111-1111-4111-8111-111111111111", AWAY = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", TAG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test("undo brings back only this household's transactions and what belongs to them", () => {
  const out = restorable({
    transactions: [{ id: T1, household_id: HOME, merchant: "Corner shop" }, { id: T2, household_id: AWAY, merchant: "Not ours" }],
    splits: [{ transaction_id: T1, amount_cents: -100 }, { transaction_id: T2, amount_cents: -100 }],
    tags: [{ transaction_id: T1, tag_id: TAG }, { transaction_id: T2, tag_id: TAG }],
    owed: [{ id: OWED, transaction_id: T1, settled_transaction_id: null }, { id: OWED, transaction_id: T2, settled_transaction_id: null }],
  }, HOME);
  assert.deepEqual(out.transactions.map((t) => t.id), [T1]);
  assert.deepEqual(out.splits.map((s) => s.transaction_id), [T1]);
  assert.deepEqual(out.tags.map((t) => t.transaction_id), [T1]);
  assert.deepEqual(out.owed.map((o) => o.transaction_id), [T1]);
});

test("undo drops rows with made-up or missing ids", () => {
  const out = restorable({
    transactions: [{ id: "1; drop table x", household_id: HOME }, { household_id: HOME }],
    splits: [{ transaction_id: "x" }], tags: [], owed: [{ id: OWED, transaction_id: null, settled_transaction_id: null }],
  }, HOME);
  assert.deepEqual(out, { transactions: [], splits: [], tags: [], owed: [] });
});

test("the check-in undo only writes what the app writes", () => {
  assert.deepEqual(checkInValue({ at: "2026-10-25T18:00:00Z", by: HOME }), { at: "2026-10-25T18:00:00Z", by: HOME });
  assert.equal(checkInValue(null), null);
  assert.equal(checkInValue({ at: "2026-10-25T18:00:00Z", by: HOME, extra: 1 }), undefined);
  assert.equal(checkInValue({ at: "soon", by: HOME }), undefined);
  assert.equal(checkInValue("x"), undefined);
});
