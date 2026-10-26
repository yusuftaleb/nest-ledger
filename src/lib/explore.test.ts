import assert from "node:assert/strict";
import { test } from "node:test";
import { alignSlots, compareWindow, groupBy, runningTotal, seriesOf, slotsOf, totals, windowOf, yearByYear, type ExploreLine } from "./explore.ts";

const today = new Date(2026, 9, 25, 12);
const l = (date: string, amount: number, top = "Groceries", kind = "spend", merchant = "No Frills", tx = date + merchant): ExploreLine => ({
  date, merchant, amount_cents: amount, bucket_id: top.toLowerCase(), bucket: top, top_bucket: top, kind, account_id: "chq", account: "Chequing", person: "Alex", transaction_id: tx,
});

test("windows: default year, searched dates, and their comparisons", () => {
  const w = windowOf({}, today);
  assert.deepEqual([w.from, w.to], ["2025-11-01", "2026-10-26"]);
  const sep = windowOf({ from: "2026-09-01", to: "2026-10-01", dateLabel: "September 2026" }, today);
  assert.deepEqual(compareWindow(sep, "prev"), { from: "2026-08-01", to: "2026-09-01", label: "the period before" });
  assert.deepEqual(compareWindow(sep, "year"), { from: "2025-09-01", to: "2025-10-01", label: "same time last year" });
  assert.equal(compareWindow(sep, "none"), null);
  // a window that runs to today is cut at tomorrow, and compared with the same days before
  const month = windowOf({ from: "2026-10-01", to: "2026-11-01" }, today);
  assert.equal(month.to, "2026-10-26");
  assert.deepEqual(compareWindow(month, "prev"), { from: "2026-09-06", to: "2026-10-01", label: "the period before" });
});

test("grouping and totals count a split receipt once", () => {
  const lines = [l("2026-10-02", -5000, "Groceries", "spend", "Superstore", "t1"), l("2026-10-02", -2000, "Baby", "spend", "Superstore", "t1"),
    l("2026-10-05", 100000, "Wages", "income", "TA pay", "t2"), l("2026-10-06", 1000, "Groceries", "spend", "Superstore", "t3")];
  const byBucket = groupBy(lines, "top_bucket", "spend");
  assert.deepEqual(byBucket.map((r) => [r.key, r.value, r.count]), [["Groceries", 4000, 2], ["Baby", 2000, 1]]);
  assert.deepEqual(groupBy(lines, "merchant", "count").map((r) => [r.label, r.value]), [["Superstore", 2], ["TA pay", 1]]);
  assert.deepEqual(totals(lines, "spend"), { value: 6000, transactions: 2 });
  assert.equal(totals(lines, "net").value, 94000);
  assert.deepEqual(groupBy(lines, "weekday", "spend").map((r) => r.label), ["Friday", "Tuesday"]);
});

test("time slots fit the window, and the comparison lines up slot by slot", () => {
  assert.equal(slotsOf({ from: "2026-10-01", to: "2026-11-01", label: "" }).length, 31);
  const q = slotsOf({ from: "2026-07-01", to: "2026-10-01", label: "" });
  assert.equal(q[0].key, "2026-07-01");
  assert.equal(q.length, 14);
  const y = slotsOf({ from: "2025-01-01", to: "2026-01-01", label: "" });
  assert.deepEqual([y.length, y[0].key, y[11].key], [12, "2025-01-01", "2025-12-01"]);
  const prev = alignSlots(y, { from: "2025-01-01", to: "2026-01-01", label: "" }, { from: "2024-01-01", to: "2025-01-01", label: "" });
  assert.deepEqual([prev[0].from, prev[11].to], ["2024-01-01", "2025-01-01"]);
  const days = slotsOf({ from: "2026-10-01", to: "2026-11-01", label: "" });
  const sep = alignSlots(days, { from: "2026-10-01", to: "2026-11-01", label: "" }, { from: "2026-09-01", to: "2026-10-01", label: "" });
  assert.equal(sep[0].from, "2026-09-01");
});

test("running totals and per-slot series", () => {
  const lines = [l("2026-10-02", -1000), l("2026-10-04", -500), l("2026-10-04", 9000, "Wages", "income", "TA")];
  const w = { from: "2026-10-01", to: "2026-10-06", label: "" };
  assert.deepEqual(runningTotal(lines, w, "spend"), [0, 1000, 1000, 1500, 1500]);
  assert.deepEqual(runningTotal(lines, w, "income", "2026-10-04"), [0, 0, 0]);
  assert.deepEqual(seriesOf(lines, slotsOf(w), "spend"), [0, 1000, 0, 500, 0]);
});

test("year by year: a month across years leaves out the one still running and counts empty months", () => {
  const lines = [
    l("2023-10-15", -9000), // records start mid-October 2023: that October is not whole, so it is left out
    l("2024-10-03", -40000), l("2025-10-09", -60000), l("2026-10-02", -10000),
    // rent sent on September 29 pays for October
    { ...l("2025-09-29", -150000, "Rent"), month: "2025-10-01" },
  ];
  const { rows, average, months } = yearByYear(lines, "spend", { from: null, to: "2026-10-26", earliest: "2023-10-15", today: "2026-10-25", month: 9 });
  assert.deepEqual(rows.map((r) => [r.year, r.value, r.partial]), [[2024, 40000, false], [2025, 210000, false], [2026, 10000, true]]);
  assert.equal(months, 2);
  assert.equal(average, 125000);
  assert.equal(windowOf({ monthOfYear: 9 }, today).from, null);
  assert.match(windowOf({ monthOfYear: 9 }, today).label, /October/);

  // no month: each year's average month, over the months on record (a month with nothing spent counts as $0)
  const avg = yearByYear([l("2026-08-10", -30000), l("2026-10-10", -5000)], "spend", { from: null, to: "2026-10-26", earliest: "2026-08-01", today: "2026-10-25" });
  assert.deepEqual(avg.rows.map((r) => [r.year, r.value, r.months]), [[2026, 15000, 2]]);
});
