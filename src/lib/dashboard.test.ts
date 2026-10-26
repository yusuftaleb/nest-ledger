import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFilter, budgetFor, carryInto, groupLines, lastMonths, periodAt, periodRange, stepPeriod, sumMeasure } from "./dashboard.ts";

const buckets = [
  { id: "groc", name: "Groceries", parent_id: null },
  { id: "baby", name: "Baby", parent_id: null },
  { id: "diap", name: "Diapers & wipes", parent_id: "baby" },
  { id: "pay", name: "Wages", parent_id: null },
  { id: "save", name: "Emergency fund", parent_id: null },
];
const line = (bucket_id: string | null, amount_cents: number, kind: string, extra: object = {}) => {
  const b = buckets.find((x) => x.id === bucket_id);
  const top = b?.parent_id ? buckets.find((x) => x.id === b.parent_id)! : b;
  return {
    date: "2026-10-05", month: "2026-10-01", merchant: "Superstore", amount_cents, account: "RBC chequing",
    bucket_id, bucket: b?.name ?? "Uncategorized", top_bucket: top?.name ?? "Uncategorized", kind,
    person: "Alex", tags: [] as string[], ...extra,
  };
};
const lines = [
  line("groc", -7000, "spend"),
  line("diap", -4420, "spend"),
  line("baby", -2000, "spend", { account: "Wise", person: "Wife" }),
  line("groc", 500, "spend"),                // refund
  line("pay", 120000, "income"),
  line("save", -10000, "goal"),             // moved to savings: not spending
  line(null, -300, "spend"),
];
const today = new Date(2026, 9, 25);

test("measures", () => {
  assert.equal(sumMeasure(lines, "spend"), 7000 + 4420 + 2000 - 500 + 300);
  assert.equal(sumMeasure(lines, "income"), 120000);
  assert.equal(sumMeasure(lines, "net"), 120000 - 13220);
  assert.equal(sumMeasure(lines, "total"), 120000 - 13220 - 10000);
});

test("group by top bucket rolls children up", () => {
  assert.deepEqual(groupLines(lines, "top_bucket", "spend").map((g) => [g.key, g.value]), [
    ["Baby", 6420], ["Groceries", 6500], ["Uncategorized", 300],
  ].sort((a, b) => (b[1] as number) - (a[1] as number)));
});

test("bucket filter includes children, other filters match names", () => {
  assert.equal(sumMeasure(applyFilter(lines, { buckets: ["baby"] }, buckets), "spend"), 6420);
  assert.equal(sumMeasure(applyFilter(lines, { accounts: ["Wise"] }, buckets), "spend"), 2000);
  assert.equal(sumMeasure(applyFilter(lines, { people: ["alex"] }, buckets), "spend"), 11220);
  assert.equal(applyFilter(lines, { buckets: ["Uncategorized"] }, buckets).length, 1);
});

test("periods", () => {
  assert.deepEqual(periodRange("quarter", today), { key: "quarter", start: "2026-10-01", end: "2027-01-01", label: "Q4 2026", months: 3 });
  assert.equal(periodRange("month", today).end, "2026-11-01");
  assert.deepEqual(lastMonths(3, today), ["2026-08-01", "2026-09-01", "2026-10-01"]);
});

test("budgets scale to the period and the latest row wins", () => {
  const budgets = [
    { bucket_id: "groc", amount_cents: 60000, period: "month", starts: "2026-01-01", ends: null },
    { bucket_id: "groc", amount_cents: 70000, period: "month", starts: "2026-10-01", ends: null },
    { bucket_id: "baby", amount_cents: 120000, period: "year", starts: "2026-01-01", ends: null },
  ];
  assert.equal(budgetFor(budgets, "groc", periodRange("month", today)), 70000);
  assert.equal(budgetFor(budgets, "groc", periodRange("quarter", today)), 210000);
  assert.equal(budgetFor(budgets, "baby", periodRange("month", today)), 10000);
  assert.equal(budgetFor(budgets, "pay", periodRange("month", today)), null);
});

test("periods can be stepped back; a past period is read as of its last day", () => {
  const now = new Date(2026, 9, 25, 12);
  const live = periodAt("month", undefined, now);
  assert.equal(live.live, true);
  assert.equal(live.range.start, "2026-10-01");
  const sep = periodAt("month", stepPeriod(live.range, -1), now);
  assert.equal(sep.range.label, "September 2026");
  assert.equal(sep.live, false);
  assert.equal(sep.anchor.getDate(), 30);
  const q = periodAt("quarter", "2026-02-14", now);
  assert.deepEqual([q.range.start, q.range.end, q.range.label], ["2026-01-01", "2026-04-01", "Q1 2026"]);
  assert.equal(stepPeriod(q.range, 1), "2026-04-01");
  assert.equal(periodAt("year", "2025-06-01", now).range.label, "2025");
  // the future and the current period both read as live
  assert.equal(periodAt("month", "2027-01-01", now).live, true);
  assert.equal(periodAt("month", "2026-10-09", now).live, true);
});

test("rollover carries what was left, or what went over, from month to month", () => {
  const rolling = { bucket_id: "groc", amount_cents: 60000, period: "month", starts: "2026-08-01", ends: null, attrs: { rollover: true } };
  const spent: Record<string, number> = { "2026-08-01": 50000, "2026-09-01": 65000 };
  const spentIn = (start: string) => spent[start] ?? 0;
  // August left $100, September went $50 over: October starts $50 ahead
  assert.equal(carryInto([rolling], "groc", "2026-10-01", spentIn), 5000);
  // before the budget began nothing carries
  assert.equal(carryInto([rolling], "groc", "2026-08-01", spentIn), 0);
  // a budget without rollover carries nothing
  assert.equal(carryInto([{ ...rolling, attrs: {} }], "groc", "2026-10-01", spentIn), 0);
  // turning rollover on in September starts the count there
  const before = { ...rolling, ends: "2026-08-31", attrs: {} };
  const after = { ...rolling, starts: "2026-09-01" };
  assert.equal(carryInto([before, after], "groc", "2026-10-01", spentIn), -5000);
});
