import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacts, readReply, readStored, type Fact } from "./ai-insights.ts";
import { applyMonthRules } from "./month-rules.ts";

const facts: Fact[] = [
  { id: "t1", value: "Groceries", about: "a bucket's name" },
  { id: "t1_avg3", value: "$812", about: "monthly average" },
  { id: "t1_3v12", value: "up 14%", about: "change" },
];

test("keeps sentences whose numbers are all facts, and fills them in", () => {
  const r = readReply({ insights: [{ tone: "warn", icon: "shopping-cart", text: "{t1} ran {t1_avg3} a month lately, {t1_3v12} on the year." }], patterns: [] }, facts);
  assert.deepEqual(r.insights, [{ tone: "warn", icon: "shopping-cart", text: "Groceries ran $812 a month lately, up 14% on the year." }]);
});

test("drops typed numbers, unknown ids and ungrounded sentences", () => {
  const r = readReply({ insights: [
    { tone: "info", icon: "sparkles", text: "Groceries ran $900 a month." },
    { tone: "info", icon: "sparkles", text: "Groceries rose 14% ({t1_3v12})." },
    { tone: "info", icon: "sparkles", text: "Groceries are {t9_avg3}." },
    { tone: "info", icon: "sparkles", text: "Spending looks steady." },
  ], patterns: [] }, facts);
  assert.equal(r.insights.length, 0);
});

test("patterns need at least one fact, and a bad icon becomes sparkles", () => {
  const r = readReply({ insights: [], patterns: [
    { icon: "rocket", title: "Food is climbing", gist: "{t1_3v12}", detail: "{t1} averages {t1_avg3} lately." },
    { icon: "leaf", title: "A calm read", gist: "", detail: "Nothing to see." },
  ] }, facts);
  assert.equal(r.patterns.length, 1);
  assert.equal(r.patterns[0].icon, "sparkles");
  assert.equal(r.patterns[0].gist, "up 14%");
});

test("stored runs older than ten days are ignored", () => {
  const row = { generated_at: "2026-10-01T12:00:00Z", items: [{ kind: "insight", tone: "good", icon: "leaf", text: "Hi" }] };
  assert.equal(readStored(row, new Date(2026, 9, 26)), null);
  assert.equal(readStored(row, new Date(2026, 9, 5))?.insights.length, 1);
});

test("facts need two whole months, and never include merchants or accounts", () => {
  const line = (date: string, amount: number, kind: string, merchant = "SECRET STORE 123") => ({
    date, month: `${date.slice(0, 7)}-01`, merchant, amount_cents: amount, kind, top_bucket: kind === "income" ? "Pay" : "Food",
    bucket: kind === "income" ? "Pay" : "Groceries", account_id: "acct-1", transaction_id: date + amount,
  });
  assert.deepEqual(buildFacts([line("2026-10-02", -1000, "spend")], new Date(2026, 9, 26)), []);
  const lines = ["2026-07", "2026-08", "2026-09", "2026-10"].flatMap((m) => [line(`${m}-03`, -12000, "spend"), line(`${m}-01`, 300000, "income", "EMPLOYER")]);
  const f = buildFacts(lines, new Date(2026, 9, 26));
  assert.ok(f.some((x) => x.id === "avg_out_3" && x.value === "$120"));
  const text = JSON.stringify(f);
  assert.ok(!text.includes("SECRET") && !text.includes("EMPLOYER") && !text.includes("acct-1"));
});

test("the summary is checked like everything else, and comes back from a stored run", () => {
  assert.equal(readReply({ summary: "{t1} ran {t1_avg3} a month, {t1_3v12}.", insights: [], patterns: [] }, facts).summary, "Groceries ran $812 a month, up 14%.");
  assert.equal(readReply({ summary: "Spending is $900.", insights: [], patterns: [] }, facts).summary, null);
  const row = { generated_at: "2026-10-26T07:00:00Z", items: [{ kind: "summary", text: "All calm." }, { kind: "insight", tone: "good", icon: "leaf", text: "Hi" }] };
  assert.equal(readStored(row, new Date(2026, 9, 26))?.summary, "All calm.");
});

test("rent sent early and income paid ahead count in the month they're for", () => {
  const line = (date: string, merchant: string, amount_cents: number, bucket: string) =>
    ({ date, month: `${date.slice(0, 7)}-01`, merchant, amount_cents, bucket, account_id: "chq" });
  const { lines, notes } = applyMonthRules([
    line("2026-07-02", "e-Transfer sent Landlord AB12", -150000, "Housing"),
    line("2026-07-31", "e-Transfer sent LandLord CD34", -150000, "Housing"),
    line("2026-12-30", "Funds transfer credit THE TRUST", 260000, "Scholarships & grants"),
    line("2026-12-30", "Funds transfer fee THETRUST", -1700, "Fees & interest"),
    line("2026-07-31", "Grocer", -5000, "Groceries"),
  ], [
    { merchant: "landlord", account_id: null, attrs: { from_day: 25 } },
    { merchant: "the trust", account_id: null, attrs: {} },
    { merchant: "nobody", account_id: null, attrs: {} },
  ]);
  assert.deepEqual(lines.map((l) => l.month), ["2026-07-01", "2026-08-01", "2027-01-01", "2027-01-01", "2026-07-01"]);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /^Housing: /);
  assert.match(notes[1], /^Scholarships & grants: /);
  assert.ok(notes.every((n) => !/\d|landlord|trust/i.test(n)));
});

test("a payment moved into this month counts from its first day", () => {
  const lines = [];
  for (const m of ["2026-07", "2026-08", "2026-09"]) lines.push({ date: `${m}-10`, month: `${m}-01`, merchant: "Shop", amount_cents: -10000, bucket: "Groceries", top_bucket: "Food", kind: "spend", account_id: "a", exclude_from_recurring: false });
  // September's rent, sent August 31, then counted in September
  lines.push({ date: "2026-08-31", month: "2026-09-01", merchant: "Rent", amount_cents: -150000, bucket: "Housing", top_bucket: "Housing", kind: "spend", account_id: "a", exclude_from_recurring: false });
  const f = Object.fromEntries(buildFacts(lines, new Date(2026, 9, 5)).map((x) => [x.id, x.value]));
  assert.equal(f.out_last_same_day, "$1,500");
});
