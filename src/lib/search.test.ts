import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesTransaction, parseSearch, withoutChip } from "./search.ts";

const ctx = {
  today: new Date(2026, 9, 25, 12),
  userId: "u1",
  members: [{ user_id: "u1", display_name: "Alex" }, { user_id: "u2", display_name: "Partner" }],
  accounts: [
    { id: "chq", name: "Everyday chequing", institution: "Northside" }, { id: "joint", name: "Joint credit card", institution: "Northside" },
    { id: "rewards", name: "Rewards card", institution: "Harbor Credit" }, { id: "globe", name: "Globe wallet", institution: "Globe" },
  ],
  buckets: [
    { id: "groc", name: "Groceries", parent_id: null, kind: "spend" }, { id: "baby", name: "Baby", parent_id: null, kind: "spend" },
    { id: "diap", name: "Diapers & wipes", parent_id: "baby", kind: "spend" }, { id: "eat", name: "Eating out", parent_id: null, kind: "spend" },
    { id: "wages", name: "Wages / TA", parent_id: null, kind: "income" }, { id: "rent", name: "Rent & utilities", parent_id: null, kind: "spend" },
  ],
};
const parse = (q: string) => parseSearch(q, ctx);

test("phrases become filters", () => {
  const { slice, chips } = parse("tims over $10 last month");
  assert.deepEqual(slice.text, ["tims"]);
  assert.equal(slice.min, 1000);
  assert.deepEqual([slice.from, slice.to], ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(chips.map((c) => c.kind).sort(), ["amount", "date", "text"]);
});

test("buckets, people, years and accounts", () => {
  const { slice } = parse("baby in 2025 by Partner on globe");
  assert.deepEqual(slice.buckets, ["baby"]);
  assert.deepEqual([slice.from, slice.to], ["2025-01-01", "2026-01-01"]);
  assert.deepEqual(slice.people, ["u2"]);
  assert.deepEqual(slice.accounts, ["globe"]);
  assert.deepEqual(slice.text, []);
  assert.deepEqual(parse("northside").slice.accounts, ["chq", "joint"]);
  assert.deepEqual(parse("eating out").slice.buckets, ["eat"]);
  assert.deepEqual(parse("rent and utilities").slice.buckets, ["rent"]);
  assert.deepEqual(parse("groc").slice.buckets, ["groc"]);
});

test("months, quarters and ranges", () => {
  assert.deepEqual([parse("september").slice.from, parse("september").slice.to], ["2026-09-01", "2026-10-01"]);
  assert.equal(parse("december").slice.from, "2025-12-01");
  assert.equal(parse("sep 2025").slice.from, "2025-09-01");
  assert.deepEqual([parse("q2 2025").slice.from, parse("q2 2025").slice.to], ["2025-04-01", "2025-07-01"]);
  assert.deepEqual([parse("last 30 days").slice.from, parse("last 30 days").slice.to], ["2026-09-26", "2026-10-26"]);
  assert.equal(parse("since march").slice.from, "2026-03-01");
  assert.equal(parse("between $10 and $20").slice.max, 2000);
  assert.equal(parse("$5-$15").slice.min, 500);
  assert.equal(parse("under 50").slice.max, 5000);
  assert.equal(parse("$14.50").slice.min, 1450);
});

test("kinds, flags and quotes", () => {
  const { slice } = parse('income needs review "baby gap"');
  assert.deepEqual(slice.kinds, ["income"]);
  assert.deepEqual(slice.flags, ["review"]);
  assert.deepEqual(slice.text, ["baby gap"]);
  assert.deepEqual(parse("mine").slice.people, ["u1"]);
  assert.deepEqual(parse("by me").slice.people, ["u1"]);
  assert.deepEqual(parse("show me groceries").slice.people, []);
});

test("removing a chip removes its words", () => {
  const q = "tims over $10 last month";
  const { chips } = parse(q);
  assert.equal(withoutChip(q, chips.find((c) => c.kind === "amount")!), "tims last month");
  assert.equal(withoutChip(q, chips.find((c) => c.kind === "date")!), "tims over $10");
});

test("transactions match by split bucket, kind and text", () => {
  const tx = { date: "2026-10-03", merchant: "Real Canadian Superstore", amount_cents: -15000, account_id: "rewards", created_by: "u2",
    splits: [{ amount_cents: -12000, bucket_id: "groc" }, { amount_cents: -3000, bucket_id: "diap" }] };
  assert.ok(matchesTransaction(tx, parse("baby").slice, ctx.buckets));
  assert.ok(matchesTransaction(tx, parse("superstore over $100 october").slice, ctx.buckets));
  assert.ok(!matchesTransaction(tx, parse("by alex").slice, ctx.buckets));
  assert.ok(matchesTransaction(tx, parse("split").slice, ctx.buckets));
  assert.ok(!matchesTransaction(tx, parse("income").slice, ctx.buckets));
});

test("the filter menus' phrases round-trip", () => {
  for (const [q, check] of [
    ["spending", (s: ReturnType<typeof parse>) => s.slice.kinds.includes("spend")],
    ["refunds", (s: ReturnType<typeof parse>) => s.slice.kinds.includes("refund")],
    ["transfers", (s: ReturnType<typeof parse>) => s.slice.kinds.includes("transfer")],
    ["$20-$100", (s: ReturnType<typeof parse>) => s.slice.min === 2000 && s.slice.max === 10000],
    ["under $20", (s: ReturnType<typeof parse>) => s.slice.max === 2000],
    ["over $500", (s: ReturnType<typeof parse>) => s.slice.min === 50000],
    ["needs review split unverified foreign", (s: ReturnType<typeof parse>) => s.slice.flags.length === 4],
    ["this quarter", (s: ReturnType<typeof parse>) => s.slice.from === "2026-10-01"],
    ["last 12 months", (s: ReturnType<typeof parse>) => s.slice.from === "2025-10-26"],
  ] as const) {
    const parsed = parse(q);
    assert.ok(check(parsed), `${q}: ${JSON.stringify(parsed.slice)}`);
    assert.equal(parsed.chips.map((c) => c.token).join(" "), q);
  }
});

test("date spans", () => {
  const span = (q: string) => { const { slice, chips } = parse(q); return [slice.from, slice.to, chips.find((c) => c.kind === "date")?.label]; };
  assert.deepEqual(span("july to oct"), ["2026-07-01", "2026-11-01", "July to October 2026"]);
  assert.deepEqual(span("from nov to feb"), ["2025-11-01", "2026-03-01", "November 2025 to February 2026"]);
  assert.deepEqual(span("between may and july 2025"), ["2025-05-01", "2025-08-01", "May to July 2025"]);
  assert.deepEqual(span("mar 2025 through jan"), ["2025-03-01", "2026-02-01", "March 2025 to January 2026"]);
  assert.deepEqual(span("2026-07-04 to 2026-08-15"), ["2026-07-04", "2026-08-16", "Jul 4 to Aug 15, 2026"]);
  assert.deepEqual(span("2026-07-04"), ["2026-07-04", "2026-07-05", "Jul 4, 2026"]);
  // amounts and words around it still work, and removing the chip removes the whole span
  const { slice, chips } = parse("tims july to oct over $10");
  assert.deepEqual([slice.text, slice.min], [["tims"], 1000]);
  assert.equal(withoutChip("tims july to oct over $10", chips.find((c) => c.kind === "date")!), "tims over $10");
  // "to" alone is still just a word
  assert.equal(parse("transfer to globe").slice.from, undefined);
});

test("one month across years, and the typical month", () => {
  for (const q of ["groceries every october", "groceries octobers", "groceries october over the years", "groceries in october each year", "average groceries october over years"]) {
    const { slice, chips } = parse(q);
    assert.equal(slice.monthOfYear, 9, q);
    assert.deepEqual(slice.buckets, ["groc"], q);
    assert.equal(slice.from, undefined, q);
    assert.deepEqual(slice.text, [], q);
    assert.ok(chips.some((c) => c.kind === "month" && c.label === "Every October"), q);
  }
  // a bare month is still its latest occurrence, and dates still narrow the years
  assert.equal(parse("october").slice.monthOfYear, undefined);
  const since = parse("dining every december since 2023").slice;
  assert.deepEqual([since.monthOfYear, since.from], [11, "2023-01-01"]);
  const avg = parse("avg groceries");
  assert.equal(avg.slice.average, true);
  assert.equal(parse("groceries per month").slice.average, true);
  const q = "average groceries every october";
  assert.equal(withoutChip(q, parse(q).chips.find((c) => c.kind === "average")!), "groceries every october");
  const oct = { date: "2025-10-04", merchant: "No Frills", amount_cents: -5000, account_id: "chq", splits: [{ amount_cents: -5000, bucket_id: "groc" }] };
  assert.equal(matchesTransaction(oct, parse("every october").slice, ctx.buckets), true);
  assert.equal(matchesTransaction({ ...oct, date: "2025-09-30" }, parse("every october").slice, ctx.buckets), false);
});
