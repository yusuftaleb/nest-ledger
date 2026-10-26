import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuickAdd } from "./quick-add.ts";

const accounts = [
  { id: "rbc", name: "RBC chequing", institution: "RBC", kind: "chequing" },
  { id: "joint", name: "Joint credit card", institution: "RBC", kind: "credit_card" },
  { id: "cibc", name: "CIBC card", institution: "CIBC", kind: "credit_card" },
  { id: "pc", name: "PC Mastercard", institution: "PC Financial", kind: "credit_card" },
  { id: "wise", name: "Wise", institution: "Wise", kind: "chequing" },
  { id: "cash", name: "Cash", institution: null, kind: "cash" },
];
const buckets = [
  { id: "groc", name: "Groceries", kind: "spend" },
  { id: "eat", name: "Eating out", kind: "spend" },
  { id: "baby", name: "Baby", kind: "spend" },
  { id: "trans", name: "Transportation", kind: "spend" },
  { id: "wage", name: "Wages / TA", kind: "income" },
];
const rules = [
  { pattern: "tim", bucket_id: "eat" },
  { pattern: "uber", bucket_id: "trans" },
  { pattern: "uber eats", bucket_id: "eat" },
  { pattern: "superstore", bucket_id: "groc" },
  { pattern: "payroll", bucket_id: "wage" },
];
// Sunday 25 October 2026
const today = new Date(2026, 9, 25);
const parse = (text: string) => parseQuickAdd(text, { today, accounts, buckets, rules });

test("amount first or last, rule picks the bucket", () => {
  for (const text of ["14.50 tims", "tims 14.50", "tims $14.50"]) {
    assert.deepEqual(parse(text), {
      amountCents: -1450, merchant: "Tims", date: "2026-10-25", accountId: null, bucketId: "eat",
    });
  }
});

test("longest rule wins", () => {
  assert.equal(parse("uber eats 32")?.bucketId, "eat");
  assert.equal(parse("uber 18")?.bucketId, "trans");
});

test("date words", () => {
  assert.equal(parse("superstore 114.20 yesterday")?.date, "2026-10-24");
  assert.equal(parse("superstore 114.20 fri")?.date, "2026-10-23");
  assert.equal(parse("superstore 114.20 saturday")?.date, "2026-10-24");
  assert.equal(parse("superstore 114.20 sunday")?.date, "2026-10-18");
  assert.equal(parse("superstore 50 oct 3")?.date, "2026-10-03");
  assert.equal(parse("superstore 50 3 oct")?.date, "2026-10-03");
  assert.equal(parse("superstore 50 dec 28")?.date, "2025-12-28");
});

test("account words", () => {
  assert.equal(parse("superstore 80 pc")?.accountId, "pc");
  assert.equal(parse("superstore 80 on cibc")?.accountId, "cibc");
  assert.equal(parse("superstore 80 joint")?.accountId, "joint");
  assert.equal(parse("netflix 16.99 wise")?.accountId, "wise");
  assert.equal(parse("superstore 80 debit")?.accountId, "rbc");
  assert.equal(parse("superstore 80 pcf")?.accountId, "pc");
  assert.equal(parse("tims 3 cash")?.accountId, "cash");
});

test("income from + or an income bucket", () => {
  assert.equal(parse("+1200 ta pay")?.amountCents, 120000);
  assert.equal(parse("payroll 950")?.amountCents, 95000);
});

test("bucket named in the text", () => {
  assert.equal(parse("45 baby clothes")?.bucketId, "baby");
  assert.equal(parse("45 baby clothes")?.merchant, "Baby clothes");
});

test("comma decimals and thousands", () => {
  assert.equal(parse("rent 1,450")?.amountCents, -145000);
  assert.equal(parse("tims 3,25")?.amountCents, -325);
});

test("nothing usable", () => {
  assert.equal(parse(""), null);
  assert.equal(parse("tims"), null);
  assert.equal(parse("14.50"), null);
});
