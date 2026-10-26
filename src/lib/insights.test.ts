import assert from "node:assert/strict";
import { test } from "node:test";
import { periodRange } from "./dashboard.ts";
import { bucketMonths, buildInsights, buildOutlook, cashflow, changes, comparison, covers, cumulative, dailySpend, forecastMonth, incomeCalendar, merchants, oneOffs, payoffPlan, priceCreep, recurring, savingsRates, seasonal, spikes, weekdayAverages } from "./insights.ts";

const today = new Date(2026, 9, 25);
const line = (date: string, amount_cents: number, top_bucket = "Groceries", kind = "spend", merchant = "Superstore", transaction_id = date + merchant) => ({
  date, month: `${date.slice(0, 7)}-01`, merchant, amount_cents, account: "RBC", bucket_id: top_bucket === "Groceries" ? "groc" : "eat",
  bucket: top_bucket, top_bucket, kind, person: "Alex", tags: [] as string[], transaction_id,
});

test("comparison lines up the same stretch of the previous period", () => {
  const cmp = comparison(periodRange("month", today), today)!;
  assert.deepEqual(cmp.now, { start: "2026-10-01", end: "2026-10-26" });
  assert.deepEqual(cmp.before, { start: "2026-09-01", end: "2026-09-26" });
  assert.equal(comparison(periodRange("quarter", today), today)!.before.start, "2026-07-01");
  assert.equal(comparison(periodRange("all", today), today), null);
});

test("changes rank buckets by how much they moved", () => {
  const lines = [line("2026-10-03", -9000), line("2026-09-03", -5000), line("2026-10-04", -1000, "Eating out"), line("2026-09-04", -4000, "Eating out")];
  const cmp = comparison(periodRange("month", today), today)!;
  assert.deepEqual(changes(lines, cmp).map((c) => [c.key, c.delta]), [["Groceries", 4000], ["Eating out", -3000]]);
});

test("daily and cumulative spend", () => {
  const lines = [line("2026-10-01", -1000), line("2026-10-01", -500), line("2026-10-03", -200), line("2026-10-03", 100)];
  assert.deepEqual(dailySpend(lines, "2026-10-01").slice(0, 3), [1500, 0, 100]);
  assert.deepEqual(cumulative(lines, "2026-10-01", "2026-10-04"), [1500, 1500, 1600]);
});

test("weekday averages count quiet days as zero", () => {
  // Mon Oct 5 and Mon Oct 12 in range; only one has spending
  const avg = weekdayAverages([line("2026-10-05", -2000)], "2026-10-05", "2026-10-19");
  assert.equal(avg[0].value, 1000);
  assert.equal(avg[1].value, 0);
});

test("merchants count a split receipt as one visit", () => {
  const rows = merchants([line("2026-10-03", -5000, "Groceries", "spend", "Costco", "t1"), line("2026-10-03", -2000, "Eating out", "spend", "Costco", "t1"), line("2026-10-09", -3000, "Groceries", "spend", "Costco", "t2")]);
  assert.deepEqual(rows[0], { merchant: "Costco", total: 10000, visits: 2, average: 5000 });
});

test("cash flow per month", () => {
  const flow = cashflow([line("2026-10-02", 200000, "Wages", "income"), line("2026-10-03", -50000)], ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(flow[1], { month: "2026-10-01", income: 200000, spend: 50000, net: 150000 });
  assert.equal(flow[0].net, 0);
});

test("insights speak only when the data supports them", () => {
  const range = periodRange("month", today);
  const quiet = buildInsights({ lines: [], range, today, budgets: [], buckets: [] });
  assert.deepEqual(quiet, []);
  const lines = [line("2026-10-02", 200000, "Wages", "income"), line("2026-10-03", -40000), line("2026-09-03", -80000)];
  const texts = buildInsights({ lines, range, today, budgets: [], buckets: [] }).map((i) => i.text);
  assert.ok(texts.some((t) => t.startsWith("You spent $400 less")), texts.join("\n"));
  assert.ok(texts.some((t) => t.startsWith("You kept 80%")));
});

test("comparisons need history that reaches back far enough", () => {
  const cmp = comparison(periodRange("year", today), today)!;
  assert.equal(covers([line("2025-08-03", -100)], cmp), false);
  assert.equal(covers([line("2025-01-09", -100)], cmp), true);
});

test("bills: steady monthly charges, not weekly shopping", () => {
  const lines = [
    ...["2026-06", "2026-07", "2026-08", "2026-09"].map((m) => line(`${m}-15`, -9500, "Phone & internet", "spend", "Freedom Mobile")),
    ...["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].flatMap((m) => ["03", "10", "17", "24"].map((d) => line(`${m}-${d}`, -12000))),
    ...["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => line(`${m}-03`, -1899, "Subscriptions", "spend", "Netflix")),
  ];
  const bills = recurring(lines, today);
  assert.deepEqual(bills.map((b) => b.merchant), ["Netflix", "Freedom Mobile"]);
  assert.equal(bills[0].paid, 1899);
  assert.equal(bills[1].paid, null);
  assert.equal(bills[1].day, 15);
});

test("subscription insights survive the Digital services rename and exclude one-off software", () => {
  for (const bucket of ["Subscriptions", "Digital services"]) {
    const lines = [
      ...["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => line(`${m}-03`, -1900, bucket, "spend", "Netflix")),
      line("2026-09-12", -5800, bucket, "spend", "One-off software"),
    ];
    const texts = buildInsights({ lines, range: periodRange("month", today), today, budgets: [], buckets: [] }).map((i) => i.text);
    assert.ok(texts.includes("Subscriptions cost $19 a month, about $228 a year."), `${bucket}: ${texts.join("\n")}`);
  }
});

test("excluded fuel purchases remain spending but never become bills or forecast bill payments", () => {
  const lines = ["2026-07", "2026-08", "2026-09"].map((m) => ({
    ...line(`${m}-10`, -6000, "Transportation", "spend", "Fuel merchant"),
    account_id: "card", exclude_from_recurring: true,
  }));
  assert.equal(recurring(lines.map((l) => ({ ...l, exclude_from_recurring: false })), today).length, 1);
  assert.deepEqual(recurring(lines, today), []);
  assert.equal(cashflow(lines, ["2026-07-01"])[0].spend, 6000);
  const forecast = forecastMonth({ lines, today,
    accounts: [{ id: "card", kind: "chequing", is_debt: false, archived: false }],
    balances: [{ account_id: "card", date: "2026-10-25", balance_cents: 100000 }],
  });
  assert.deepEqual(forecast?.bills, []);
});

test("savings rate and the bucket × month grid", () => {
  const lines = [line("2026-09-02", 100000, "Wages", "income"), line("2026-09-05", -25000), line("2026-10-05", -5000, "Eating out")];
  const rates = savingsRates(lines, ["2026-09-01", "2026-10-01"]);
  assert.equal(rates[0].rate, 0.75);
  assert.equal(rates[1].rate, null);
  const grid = bucketMonths(lines, ["2026-09-01", "2026-10-01"], 5);
  assert.deepEqual(grid.map((r) => [r.bucket, r.values]), [["Groceries", [25000, 0]], ["Eating out", [0, 5000]]]);
});

test("outlook needs three whole months and says how long savings last", () => {
  assert.deepEqual(buildOutlook({ lines: [line("2026-09-05", -1000)], today, netWorth: null }), []);
  const lines = ["2026-07", "2026-08", "2026-09"].flatMap((m) => [line(`${m}-02`, 300000, "Wages", "income"), line(`${m}-05`, -200000)]);
  const texts = buildOutlook({ lines, today, netWorth: 600000 }).map((i) => i.text);
  assert.ok(texts.includes("A typical month brings in $3,000 and sends out $2,000."), texts.join("\n"));
  assert.ok(texts.some((t) => t.startsWith("What you have now would cover about 3 months")), texts.join("\n"));
});

test("payoff: avalanche clears the dearest debt first and never costs more than snowball", () => {
  const debts = [
    { name: "Card", balance: 300000, apr: 20.99, minimum: 9000 },
    { name: "Loan", balance: 150000, apr: 6, minimum: 5000 },
  ];
  const avalanche = payoffPlan(debts, 20000, "avalanche"), snowball = payoffPlan(debts, 20000, "snowball");
  assert.equal(avalanche.order[0].name, "Card");
  assert.equal(snowball.order[0].name, "Loan");
  assert.ok(avalanche.interest <= snowball.interest);
  const minimumsOnly = payoffPlan(debts, 0, "avalanche");
  assert.ok(minimumsOnly.months! > avalanche.months!);
  assert.equal(payoffPlan([{ name: "Card", balance: 500000, apr: 30, minimum: 1000 }], 0, "avalanche").months, null);
});

test("forecast: today's balance moves with later transactions, then bills and everyday spending come off", () => {
  const acc = (l: ReturnType<typeof line>) => ({ ...l, account_id: "rbc" });
  const lines = [
    ...["2026-07", "2026-08", "2026-09"].map((m) => acc(line(`${m}-28`, -9500, "Phone & internet", "spend", "Freedom Mobile"))),
    acc(line("2026-10-20", -10000)),
  ];
  const f = forecastMonth({
    lines, today, accounts: [{ id: "rbc", kind: "chequing", is_debt: false, archived: false }],
    balances: [{ account_id: "rbc", date: "2026-10-15", balance_cents: 200000 }],
  })!;
  assert.equal(f.today, 190000);
  assert.deepEqual(f.bills, [{ name: "Freedom Mobile", amount: 9500 }]);
  assert.equal(f.end, f.today - 9500 - f.everyday.total);
});

test("regular income: pay twice a month is still regular, and the forecast expects the rest of it", () => {
  const acc = (l: ReturnType<typeof line>) => ({ ...l, account_id: "rbc" });
  const pay = ["2026-07", "2026-08", "2026-09", "2026-10"].flatMap((m) => ["16", "30"].map((d) => acc(line(`${m}-${d}`, 120000, "Wages", "income", "TA pay"))))
    .filter((l) => l.date <= "2026-10-25");
  assert.deepEqual(recurring(pay, today, "income").map((b) => b.merchant), ["TA pay"]);
  const f = forecastMonth({
    lines: pay, today, accounts: [{ id: "rbc", kind: "chequing", is_debt: false, archived: false }],
    balances: [{ account_id: "rbc", date: "2026-10-24", balance_cents: 100000 }],
  })!;
  assert.deepEqual(f.income, [{ name: "TA pay", amount: 120000 }]);
});

test("patterns: price creep, spikes, one-offs, seasons, income days", () => {
  const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const netflix = months.map((m, i) => line(`${m}-03`, i < 8 ? -1699 : -1899, "Subscriptions", "spend", "Netflix", `n${i}`));
  const creep = priceCreep(netflix, today);
  assert.equal(creep.length, 1);
  assert.deepEqual([creep[0].before, creep[0].now, creep[0].since], [1699, 1899, "2026-07-03"]);

  const shop = ["2026-06-02", "2026-07-02", "2026-08-02", "2026-10-02"].map((d, i) => line(d, i === 3 ? -24000 : -6000, "Groceries", "spend", "No Frills", `f${i}`));
  assert.deepEqual(spikes(shop, "2026-10-01", "2026-11-01").map((s) => [s.merchant, s.amount, s.usual]), [["No Frills", 24000, 6000]]);

  const big = [line("2026-10-05", -60000, "Household", "spend", "IKEA", "ikea"), line("2026-10-06", -5000, "Groceries", "spend", "No Frills", "nf")];
  const o = oneOffs(big, "2026-10-01", "2026-11-01", today);
  assert.deepEqual(o.items.map((i) => i.merchant), ["IKEA"]);
  assert.equal(o.typical, 5000);

  assert.equal(seasonal(netflix.slice(0, 5), today), null);
  const year = months.slice(0, 11).map((m) => line(`${m}-10`, m.endsWith("-12") ? -90000 : -30000, "Groceries", "spend", "Store", m));
  const extra = line("2024-12-10", -30000, "Groceries", "spend", "Store", "old");
  const s = seasonal([...year, extra], today)!;
  assert.deepEqual([s[11].average, s[11].years], [60000, 2]);

  const pay = ["2026-07", "2026-08", "2026-09", "2026-10"].flatMap((m) => ["15", "30"].map((d) => line(`${m}-${d}`, 120000, "Wages", "income", "TA pay")))
    .filter((l) => l.date <= "2026-10-25");
  assert.deepEqual(incomeCalendar(pay, today).map((i) => [i.name, i.days]), [["TA pay", [15, 30]]]);
});

test("bills: same day each month (wrapping month end); random rides don't count", () => {
  const rent = [["2026-06-01"], ["2026-07-01"], ["2026-07-31"], ["2026-09-01"]].map(([d], i) => line(d, -165000, "Rent", "spend", "Landlord", `r${i}`));
  assert.deepEqual(recurring(rent, today).map((b) => b.merchant), ["Landlord"]);
  const rides = [["2026-06-03", -1500], ["2026-07-19", -2100], ["2026-08-27", -1800], ["2026-09-09", -1700]].map(([d, a], i) => line(d as string, a as number, "Transportation", "spend", "Uber", `u${i}`));
  assert.deepEqual(recurring(rides, today), []);
});
