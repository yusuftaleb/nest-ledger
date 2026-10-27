import assert from "node:assert/strict";
import { test } from "node:test";
import { alignSlots, compareWindow, dailySums, firstWholeMonth, flowOf, groupBy, monthRun, runningTotal, seriesOf, slotsOf, totals, upToDay, usualBand, weightOf, windowOf, yearByYear, type ExploreLine } from "./explore.ts";
import { addMonths } from "./dates.ts";

const today = new Date(2026, 9, 25, 12);
const l = (date: string, amount: number, top = "Groceries", kind = "spend", merchant = "No Frills", tx = date + merchant): ExploreLine => ({
  date, merchant, amount_cents: amount, bucket_id: top.toLowerCase(), bucket: top, top_bucket: top, kind, account_id: "chq", account: "Chequing", person: "Alex", transaction_id: tx,
});

test("windows: default month, searched dates, and their comparisons", () => {
  // no dates asked for: this month so far
  const d = windowOf({}, today);
  assert.deepEqual([d.from, d.to, d.label], ["2026-10-01", "2026-10-26", "This month"]);
  const w = { from: "2025-11-01", to: "2026-10-26", label: "Last 12 months" };
  const sep = windowOf({ from: "2026-09-01", to: "2026-10-01", dateLabel: "September 2026" }, today);
  assert.deepEqual(compareWindow(sep, "prev"), { from: "2026-08-01", to: "2026-09-01", label: "the period before" });
  assert.deepEqual(compareWindow(sep, "year"), { from: "2025-09-01", to: "2025-10-01", label: "same time last year" });
  assert.equal(compareWindow(sep, "none"), null);
  // a window that runs to today is cut at tomorrow, and compared with the same days of the month before
  const month = windowOf({ from: "2026-10-01", to: "2026-11-01" }, today);
  assert.equal(month.to, "2026-10-26");
  assert.deepEqual(compareWindow(month, "prev"), { from: "2026-09-01", to: "2026-09-26", label: "the period before" });
  // the last 12 months against the 12 before, up to the same date (what Insights compares with too)
  assert.deepEqual(compareWindow(w, "prev"), { from: "2024-11-01", to: "2025-10-26", label: "the period before" });
  // a stretch that doesn't start on the 1st steps back by its own length
  assert.deepEqual(compareWindow({ from: "2026-10-11", to: "2026-10-26", label: "" }, "prev"), { from: "2026-09-26", to: "2026-10-11", label: "the period before" });
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

test("pace band and weight: this month against the usual month at the same day", () => {
  // six past months: rent on the 1st, then $10 a day; the months grow by $50 each
  const lines: ExploreLine[] = [];
  for (let i = 1; i <= 12; i++) {
    const m = addMonths("2026-10-01", -i);
    lines.push(l(m, -100000 - i * 5000, "Rent", "spend", "Landlord", "r" + m));
    for (let d = 2; d <= 28; d++) lines.push(l(`${m.slice(0, 8)}${String(d).padStart(2, "0")}`, -1000, "Groceries", "spend", "Shop", `${m}-${d}`));
  }
  lines.push(l("2026-10-01", -90000, "Rent", "spend", "Landlord", "r-now"), l("2026-10-03", 300000, "Wages", "income", "Pay", "pay"));
  const daily = dailySums(lines, "2025-09-01", "2026-10-26");
  assert.deepEqual(daily["2026-10-03"], [0, 300000, 1]);
  const run = monthRun(daily, "2026-09-01", "spend");
  assert.equal(run.length, 30);
  assert.equal(run[0], 105000);
  assert.equal(run[29], 105000 + 27 * 1000);
  const band = usualBand(daily, "2026-10-01", "spend", "2025-10-01")!;
  assert.equal(band.months, 6);
  assert.equal(band.low.length, 31);
  assert.equal(band.low[0], 105000);
  assert.equal(band.high[0], 130000);
  // a month starting on rent of $900 against the last six, $1,050 to $1,300 on the 1st: light, on the same months as the band
  const w = weightOf(daily, "2026-10-01", 1, "spend", firstWholeMonth("2025-10-01"))!;
  assert.deepEqual(w, { level: "low", now: 90000, usual: 117500, months: 6 });
  assert.equal(weightOf(daily, "2026-10-01", 1, "spend", "2026-08-01"), null);
  assert.equal(usualBand(daily, "2026-10-01", "spend", "2026-08-01"), null);
  assert.equal(firstWholeMonth("2025-03-14"), "2025-04-01");
  assert.equal(upToDay(lines.filter((x) => x.date.startsWith("2026-09")), 3, "spend"), 105000 + 2000);
});

test("money flow: in by bucket, out by bucket, set aside, and what is left or short", () => {
  const lines = [l("2026-10-03", 300000, "Wages", "income", "Pay", "a"), l("2026-10-04", 50000, "Benefit", "income", "CCB", "b"),
    l("2026-10-01", -150000, "Rent", "spend", "Landlord", "c"), l("2026-10-05", -40000, "Groceries", "spend", "Shop", "d"),
    l("2026-10-06", -60000, "Savings", "saving", "Move", "e")];
  const f = flowOf(lines);
  assert.deepEqual(f.sources.map((s) => [s.label, s.value]), [["Wages", 300000], ["Benefit", 50000]]);
  assert.deepEqual(f.targets.map((s) => [s.label, s.value]), [["Rent", 150000], ["Groceries", 40000], ["Set aside", 60000], ["Left", 100000]]);
  assert.equal(f.left, 100000);
  const short = flowOf([l("2026-10-03", 100000, "Wages", "income", "Pay", "a"), l("2026-10-01", -150000, "Rent", "spend", "Landlord", "c")]);
  assert.deepEqual(short.sources.at(-1), { key: "__short", label: "Overspent", value: 50000, role: "short" });
  assert.equal(short.targets.some((t) => t.role === "left"), false);
  const many = flowOf(["A", "B", "C", "D", "E", "F", "G", "H"].map((b, i) => l("2026-10-02", -(i + 1) * 100, b, "spend", "x", b)).concat(l("2026-10-01", 100000, "Wages", "income", "Pay", "p")));
  assert.equal(many.targets.length, 6 + 1 + 1);
  assert.equal(many.targets[6].label, "Everything else");
});
