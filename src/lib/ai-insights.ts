import { CURRENCY } from "./format.ts";
import { formatCents } from "./money.ts";
import { lastMonths, measureOf } from "./dashboard.ts";
import { isoDate } from "./dates.ts";
import { oneOffs, recurring, type Insight } from "./insights.ts";

// Insights and patterns written by the household's own AI agent (such as Codex, signed in with their own account). The app
// does the arithmetic: it hands over numbered facts, Codex writes sentences that point at them as {id}, and only
// sentences whose every number is one of those facts are kept. What leaves the house is bucket-level sums: never
// a merchant, an account or who paid.

/** One number (or name) Codex may use, already written the way the app shows it. */
export type Fact = { id: string; value: string; about: string };

export type AiPattern = { icon: string; title: string; gist: string; detail: string };
/** The latest run, as the app reads it. */
export type AiRead = { generatedAt: string; summary: string | null; insights: Insight[]; patterns: AiPattern[] };

type LineLike = Parameters<typeof recurring>[0][number] & { date: string; month: string; top_bucket: string; bucket: string };
/** Only what the facts need: no account names, people or notes are ever read. */
export type FactLine = Pick<LineLike, "date" | "month" | "merchant" | "amount_cents" | "bucket" | "top_bucket" | "kind"
  | "exclude_from_recurring"> & { account_id: string; transaction_id?: string };

/** The icons Codex may pick (names from the app's icon set). */
export const AI_ICONS = ["trending-up", "trending-down", "piggy-bank", "calendar", "calendar-clock", "triangle-alert", "sparkles", "leaf",
  "baby", "shopping-cart", "house", "utensils", "car", "receipt", "wallet", "flame", "sun", "snowflake", "gift", "repeat", "target",
  "scale", "chart-line", "coins", "lightbulb", "clock"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dollars = (cents: number) => `${cents < 0 ? "−" : ""}${formatCents(Math.round(Math.abs(cents) / 100) * 100, { sign: false, trim: true })}`;
const pct = (x: number) => `${Math.round(x * 100)}%`.replace("-", "−");
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const key = (m: string) => m.slice(0, 7).replace("-", "_");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
/** "up 12%", "down 8%" or "about the same", so the direction is never Codex's to get wrong. */
function change(now: number, before: number): string | null {
  if (before <= 0) return null;
  const r = now / before - 1;
  return Math.abs(r) < 0.03 ? "about the same" : `${r > 0 ? "up" : "down"} ${pct(Math.abs(r))}`;
}
/** "$120 more" / "$80 less" / "about the same". */
function diff(now: number, before: number): string {
  const d = now - before;
  return Math.abs(d) < 500 ? "about the same" : `${dollars(Math.abs(d))} ${d > 0 ? "more" : "less"}`;
}

/**
 * Everything Codex may say, as facts: the last year month by month, averages and their direction, this month and
 * this year so far against the same point before, each bigger bucket's story, the seasons, weekends, bills, one-offs
 * and the size of purchases. Only whole months count for averages. Empty with fewer than two whole months.
 */
export function buildFacts(read: FactLine[], today: Date): Fact[] {
  // the shared helpers take full lines; the fields they'd show are left blank
  const lines: LineLike[] = read.map((l) => ({ account: "", bucket_id: null, person: null, tags: [], ...l }));
  const facts: Fact[] = [];
  const add = (id: string, value: string | null, about: string) => { if (value !== null) facts.push({ id, value, about }); };
  const all = lastMonths(25, today);
  const current = all.at(-1)!;
  const seen = new Set(lines.map((l) => l.month));
  const first = [...seen].sort()[0];
  const full = all.slice(0, -1).filter((m) => first && m >= first);
  if (full.length < 2) return [];
  const spend = new Map<string, number>(), income = new Map<string, number>();
  for (const l of lines) {
    spend.set(l.month, (spend.get(l.month) ?? 0) + measureOf(l, "spend"));
    income.set(l.month, (income.get(l.month) ?? 0) + measureOf(l, "income"));
  }
  const out = (m: string) => spend.get(m) ?? 0, inn = (m: string) => income.get(m) ?? 0;
  const year = full.slice(-12), three = full.slice(-3);
  const day = today.getDate(), daysIn = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  add("today", `${MONTHS[today.getMonth()]} ${day}, ${today.getFullYear()}`, "today's date");
  add("months_on_record", String(full.length), "whole months of history the facts draw on (up to two years)");

  // the last year, month by month
  for (const m of year) {
    const k = key(m);
    add(`mon_${k}`, monthName(m), "a month's name");
    add(`out_${k}`, dollars(out(m)), `spending in ${monthName(m)}`);
    add(`in_${k}`, dollars(inn(m)), `income in ${monthName(m)}`);
    add(`kept_${k}`, dollars(inn(m) - out(m)), `income minus spending in ${monthName(m)} (negative = spent more than came in)`);
    if (inn(m) > 0) add(`rate_${k}`, pct((inn(m) - out(m)) / inn(m)), `share of income kept in ${monthName(m)}`);
  }
  const avgOut12 = avg(year.map(out)), avgOut3 = avg(three.map(out)), avgIn12 = avg(year.map(inn)), avgIn3 = avg(three.map(inn));
  add("avg_out_12", dollars(avgOut12), `average monthly spending over the last ${year.length} whole months`);
  add("avg_out_3", dollars(avgOut3), "average monthly spending over the last three whole months");
  add("out_3_vs_12", change(avgOut3, avgOut12), "the last three months' average spending against the longer average");
  add("avg_in_12", dollars(avgIn12), `average monthly income over the last ${year.length} whole months`);
  add("avg_in_3", dollars(avgIn3), "average monthly income over the last three whole months");
  add("in_3_vs_12", change(avgIn3, avgIn12), "the last three months' average income against the longer average");
  const in12 = sum(year.map(inn)), out12 = sum(year.map(out));
  add("kept_12", dollars(in12 - out12), `income minus spending over the last ${year.length} whole months`);
  if (in12 > 0) add("rate_12", pct((in12 - out12) / in12), `share of income kept over the last ${year.length} whole months`);
  add("months_short_12", String(year.filter((m) => out(m) > inn(m)).length), `how many of the last ${year.length} whole months spent more than came in`);
  const byOut = [...year].sort((a, b) => out(b) - out(a));
  add("top_out_month", monthName(byOut[0]), "the costliest of the last year's whole months");
  add("top_out", dollars(out(byOut[0])), "spending in that costliest month");
  add("low_out_month", monthName(byOut.at(-1)!), "the cheapest of the last year's whole months");
  add("low_out", dollars(out(byOut.at(-1)!)), "spending in that cheapest month");

  // this month so far, against the same days of last month
  const last = full.at(-1)!;
  // a payment counted in a later month than it landed in (rent sent early) sits at that month's start
  const dayOf = (l: LineLike) => (l.date.slice(0, 7) === l.month.slice(0, 7) ? Number(l.date.slice(8, 10)) : 1);
  const sameDay = (m: string) => lines.filter((l) => l.month === m && dayOf(l) <= day);
  const mtd = out(current), lastMtd = sum(sameDay(last).map((l) => measureOf(l, "spend")));
  add("mon_now", monthName(current), "this month");
  add("day_of_month", String(day), "how many days of this month have passed");
  add("days_in_month", String(daysIn), "days in this month");
  add("out_mtd", dollars(mtd), "spending so far this month");
  add("in_mtd", dollars(inn(current)), "income so far this month");
  add("out_last_same_day", dollars(lastMtd), "spending in the same days of last month");
  add("mtd_vs_last", change(mtd, lastMtd), "spending so far this month against the same days of last month");
  if (day >= 7) add("out_pace", dollars((mtd / day) * daysIn), "this month's spending if the rest of the month keeps the same daily pace (rough)");

  // the year so far, against the same point last year
  const y = today.getFullYear();
  const ytd = (yr: number, measure: string) => sum(lines.filter((l) => l.date >= `${yr}-01-01` && l.date < `${yr}-${isoDate(today).slice(5)}`).map((l) => measureOf(l, measure)));
  if (first && first <= `${y - 1}-01-01`) {
    add("out_ytd", dollars(ytd(y, "spend")), `spending from January 1 to today, ${y}`);
    add("out_ytd_prev", dollars(ytd(y - 1, "spend")), `spending from January 1 to the same day, ${y - 1}`);
    add("ytd_change", change(ytd(y, "spend"), ytd(y - 1, "spend")), "this year's spending so far against the same point last year");
    add("in_ytd", dollars(ytd(y, "income")), `income from January 1 to today, ${y}`);
    add("in_ytd_prev", dollars(ytd(y - 1, "income")), `income from January 1 to the same day, ${y - 1}`);
  }

  // each bigger bucket's story: top-level buckets, then the biggest buckets inside them
  const total12 = out12 || 1;
  const story = (prefix: string, name: string, of: (l: LineLike) => boolean) => {
    const by = new Map<string, number>();
    for (const l of lines) if (of(l)) by.set(l.month, (by.get(l.month) ?? 0) + measureOf(l, "spend"));
    // a month where refunds outweighed purchases counts as nothing spent, not as negative spending
    const v = (m: string) => Math.max(0, by.get(m) ?? 0);
    const t12 = sum(year.map(v));
    add(prefix, name, "a bucket's name");
    add(`${prefix}_12`, dollars(t12), `${name}: total over the last ${year.length} whole months`);
    add(`${prefix}_share`, pct(t12 / total12), `${name}: share of all spending over that time`);
    add(`${prefix}_avg12`, dollars(t12 / year.length), `${name}: monthly average over that time`);
    add(`${prefix}_avg3`, dollars(avg(three.map(v))), `${name}: monthly average over the last three whole months`);
    add(`${prefix}_3v12`, change(avg(three.map(v)), t12 / year.length), `${name}: last three months against the longer average`);
    add(`${prefix}_last`, dollars(v(last)), `${name}: spending in ${monthName(last)}`);
    const ago = full.find((m) => m === `${Number(last.slice(0, 4)) - 1}${last.slice(4)}`);
    if (ago) add(`${prefix}_yoy`, change(v(last), v(ago)), `${name}: ${monthName(last)} against ${monthName(ago)}`);
    if (v(current) > 0) add(`${prefix}_mtd`, dollars(v(current)), `${name}: so far this month`);
    add(`${prefix}_active`, String(year.filter((m) => v(m) > 0).length), `${name}: how many of the last ${year.length} whole months had any`);
    const peak = [...year].sort((a, b) => v(b) - v(a))[0];
    add(`${prefix}_peak_month`, monthName(peak), `${name}: its costliest month`);
    add(`${prefix}_peak`, dollars(v(peak)), `${name}: spending in that month`);
    if (year.length >= 12) {
      const h1 = sum(year.slice(0, 6).map(v)), h2 = sum(year.slice(6).map(v));
      add(`${prefix}_halves`, change(h2, h1), `${name}: the last six whole months against the six before`);
    }
  };
  const rank = (field: "top_bucket" | "bucket") => {
    const totals = new Map<string, number>();
    for (const l of lines) if (l.month >= year[0] && l.month < current) totals.set(l[field], (totals.get(l[field]) ?? 0) + measureOf(l, "spend"));
    return [...totals.entries()].filter(([name, t]) => name && t > 0).sort((a, b) => b[1] - a[1]);
  };
  const tops = rank("top_bucket").slice(0, 12);
  tops.forEach(([name], i) => story(`t${i + 1}`, name, (l) => l.top_bucket === name));
  const topNames = new Set(tops.map(([n]) => n));
  rank("bucket").filter(([name]) => !topNames.has(name)).slice(0, 12)
    .forEach(([name], i) => story(`c${i + 1}`, name, (l) => l.bucket === name && l.bucket !== l.top_bucket));

  // the seasons, once there's a year of whole months
  if (full.length >= 12) {
    const by = Array.from({ length: 12 }, () => [] as number[]);
    for (const m of full) by[Number(m.slice(5, 7)) - 1].push(out(m));
    const usual = avg(full.map(out));
    add("season_usual", dollars(usual), "spending in a usual month, across every whole month on record");
    by.forEach((vs, i) => vs.length && add(`season_${String(i + 1).padStart(2, "0")}`, dollars(avg(vs)), `average spending in ${MONTHS[i]} across the years on record`));
  }

  // weekends, bills, one-offs and the size of purchases (the last year)
  const charges = new Map<string, { date: string; value: number }>();
  for (const l of lines) {
    const v = measureOf(l, "spend");
    if (v <= 0 || l.month < year[0] || l.month >= current) continue;
    const id = l.transaction_id ?? `${l.date}|${l.merchant}|${l.amount_cents}`;
    const c = charges.get(id) ?? { date: l.date, value: 0 };
    c.value += v;
    charges.set(id, c);
  }
  const list = [...charges.values()];
  const weekend = list.filter((c) => [0, 6].includes(new Date(`${c.date}T12:00`).getDay()));
  const days = Math.max(1, Math.round((new Date(`${current}T12:00`).getTime() - new Date(`${year[0]}T12:00`).getTime()) / 86_400_000));
  add("weekend_share", pct(sum(weekend.map((c) => c.value)) / total12), "share of spending on Saturdays and Sundays (an even spread across the week would be about two sevenths)");
  add("weekend_day", dollars(sum(weekend.map((c) => c.value)) / Math.max(1, days * 2 / 7)), "average spending on a weekend day");
  add("weekday_day", dollars((out12 - sum(weekend.map((c) => c.value))) / Math.max(1, days * 5 / 7)), "average spending on a weekday");
  add("purchases_month", String(Math.round(list.filter((c) => c.date >= three[0]).length / three.length)), "purchases a month, over the last three whole months");
  add("big_share", pct(sum(list.filter((c) => c.value >= 50_000).map((c) => c.value)) / total12), "share of spending from single purchases of $500 or more");
  add("small_month", dollars(sum(list.filter((c) => c.value < 2_000).map((c) => c.value)) / year.length), "average a month spent in purchases under $20");
  const bills = recurring(lines, today);
  if (bills.length) {
    const b = sum(bills.map((x) => x.amount));
    add("bills_count", String(bills.length), "regular monthly bills found (same place, about the same amount, around the same day)");
    add("bills_month", dollars(b), "what those bills add up to each month");
    if (avgOut3 > 0) add("bills_share", pct(b / avgOut3), "share of a recent month's spending that is those bills");
  }
  const regular = recurring(lines, today, "income");
  if (regular.length) add("regular_in_month", dollars(sum(regular.map((x) => x.amount))), "income that arrives like clockwork each month");
  const once = oneOffs(lines, year[0], current, today);
  if (once.items.length) {
    add("oneoff_count", String(once.items.length), "the biggest one-off costs in the last year, counting at most eight ($150 or more, at a place rarely visited)");
    add("oneoff_total", dollars(once.total), "what those one-offs added up to");
    add("typical_month", dollars(once.typical), "a typical month's spending without the one-offs");
  }
  return facts;
}

const ALL_IDS = /\{([a-z0-9_]+)\}/g;

/** What Codex is asked, with the facts and last run's items (so it moves on instead of repeating itself). */
export function promptFor(facts: Fact[], previous: string[], timing: string[] = []): string {
  return [
    `You write the Insights and Patterns for a private household money tracker used by one household. Amounts are in ${CURRENCY}.`,
    "Do not run commands, read files or browse. Everything you need is below. Reply only with JSON that matches the schema.",
    "",
    "THE ONE HARD RULE: never type a digit, a $ sign or a % sign yourself. Every number, amount, percentage, date and count must be written as a fact id in braces, for example \"Groceries ran {t2_avg3} a month lately, {t2_3v12} on the year.\" The app replaces {t2_avg3} with the fact's value. Anything with a typed number is thrown away. Use only ids from the list. Bucket names may be written as words or as their id.",
    "",
    "What makes a good item:",
    "- It says something the household would not see at a glance: a shift in the mix, a trend under way, a habit, a tension between income and spending, what is driving a change, what the year is on track for, a season to plan for.",
    "- It is specific and true to the facts. Each value's meaning is described next to it; respect it (\"up 12%\" already carries its direction). Never imply a cause the facts don't show; say \"looks like\" when inferring.",
    "- Plain, warm and direct, like a sharp friend who is good with money. No judgment, no jargon, no generic advice (no \"consider budgeting\"). A concrete lever is welcome when the facts point to one.",
    "- The app already shows, in other places: monthly totals, the savings rate by month, the biggest buckets, prices that went up at a place, unusually big charges, one-off costs, costlier calendar months, and when income arrives. Go beyond restating those.",
    "",
    "summary: one or two sentences (under 240 characters) that say where the household stands right now and the one thing that matters most. It leads the card on the home screen, so make it the read a busy person needs if they see nothing else. Same number rule.",
    "insights: 6 to 10 single sentences, under 170 characters each, most useful first. tone is good (healthy), warn (needs attention) or info. Pick the icon that fits.",
    "patterns: 3 to 5 deeper reads. title is a short heading (under 40 characters, sentence case). gist is a tiny summary shown beside the title (under 28 characters, usually one fact). detail is 1 to 3 sentences explaining it.",
    `icons: ${AI_ICONS.join(", ")}`,
    timing.length ? `\nTiming the monthly figures already account for (so never call a month's payment missing or doubled because of it):\n${timing.map((t) => `- ${t}`).join("\n")}` : "",
    previous.length ? `\nLast time you wrote these. Keep one only if it is still among the most important, and say something new where you can:\n${previous.map((p) => `- ${p}`).join("\n")}` : "",
    "",
    "FACTS (id: value, what it means):",
    ...facts.map((f) => `${f.id}: ${f.value} (${f.about})`),
  ].join("\n");
}

/** The JSON shape Codex must reply in. */
export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "insights", "patterns"],
  properties: {
    summary: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["tone", "icon", "text"],
        properties: { tone: { type: "string", enum: ["good", "warn", "info"] }, icon: { type: "string", enum: AI_ICONS }, text: { type: "string" } },
      },
    },
    patterns: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["icon", "title", "gist", "detail"],
        properties: { icon: { type: "string", enum: AI_ICONS }, title: { type: "string" }, gist: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
};

/**
 * Fill in one piece of text, or null if it can't be trusted: an unknown id, or a number, $ or % typed outside the
 * facts. Sentences that name no fact at all are allowed only where noted.
 */
function fill(text: unknown, byId: Map<string, string>, max: number, needsFact: boolean): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > max) return null;
  const ids = [...clean.matchAll(ALL_IDS)].map((m) => m[1]);
  if (ids.some((id) => !byId.has(id))) return null;
  if (needsFact && ids.length === 0) return null;
  if (/[0-9$%{}]/.test(clean.replace(ALL_IDS, ""))) return null;
  return clean.replace(ALL_IDS, (_, id: string) => byId.get(id)!);
}

/** Codex's reply, checked: only items whose every number is a fact survive (a summary, at most 10 insights and 5 patterns). */
export function readReply(reply: unknown, facts: Fact[]): { summary: string | null; insights: Insight[]; patterns: AiPattern[] } {
  const byId = new Map(facts.map((f) => [f.id, f.value]));
  const r = (reply ?? {}) as { summary?: unknown; insights?: unknown; patterns?: unknown };
  const icon = (i: unknown) => (typeof i === "string" && AI_ICONS.includes(i) ? i : "sparkles");
  const insights: Insight[] = [];
  for (const raw of Array.isArray(r.insights) ? r.insights : []) {
    const item = raw as Record<string, unknown>;
    const text = fill(item?.text, byId, 240, true);
    const tone = item?.tone === "good" || item?.tone === "warn" ? item.tone : "info";
    if (text && !insights.some((i) => i.text === text)) insights.push({ tone, icon: icon(item.icon), text });
  }
  const patterns: AiPattern[] = [];
  for (const raw of Array.isArray(r.patterns) ? r.patterns : []) {
    const item = raw as Record<string, unknown>;
    const title = fill(item?.title, byId, 60, false), gist = fill(item?.gist, byId, 40, false), detail = fill(item?.detail, byId, 600, false);
    const grounded = [item?.title, item?.gist, item?.detail].some((t) => typeof t === "string" && /\{[a-z0-9_]+\}/.test(t));
    if (title && gist !== null && detail && grounded) patterns.push({ icon: icon(item.icon), title, gist, detail });
  }
  return { summary: fill(r.summary, byId, 320, true), insights: insights.slice(0, 10), patterns: patterns.slice(0, 5) };
}

/** A stored run (the ai_insights row) as the app uses it; null when it's missing, empty or too old to trust. */
export function readStored(row: { generated_at: string; items: unknown } | null, today: Date, maxDays = 10): AiRead | null {
  if (!row || !Array.isArray(row.items)) return null;
  if (today.getTime() - new Date(row.generated_at).getTime() > maxDays * 86_400_000) return null;
  const items = row.items as Record<string, unknown>[];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const insights: Insight[] = items.filter((i) => i?.kind === "insight" && str(i.text))
    .map((i) => ({ tone: i.tone === "good" || i.tone === "warn" ? i.tone : "info", icon: str(i.icon) || "sparkles", text: str(i.text) }));
  const patterns: AiPattern[] = items.filter((i) => i?.kind === "pattern" && str(i.title) && str(i.detail))
    .map((i) => ({ icon: str(i.icon) || "sparkles", title: str(i.title), gist: str(i.gist), detail: str(i.detail) }));
  const summary = str(items.find((i) => i?.kind === "summary")?.text) || null;
  if (!insights.length && !patterns.length) return null;
  return { generatedAt: row.generated_at, summary, insights, patterns };
}
