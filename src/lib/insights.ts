import { LOCALE, weekdayIndex, weekdayNames } from "./format.ts";
import { budgetFor, groupLines, inRange, measureOf, sumMeasure, type Range } from "./dashboard.ts";
import { tidyMerchant } from "./merchant.ts";
import { formatCents, isoDate } from "./money.ts";

// Pure analysis behind the charts and the "Worth knowing" card. Everything here takes rows of the
// `lines` view and plain dates, so it is easy to test and works the same for real and demo data.

type LineLike = Parameters<typeof groupLines>[0][number] & { transaction_id?: string; exclude_from_recurring?: boolean };
type BudgetLike = Parameters<typeof budgetFor>[0][number];
type BucketLike = { id: string; name: string; parent_id: string | null; kind: string; archived: boolean };

const DAY = 86_400_000;
const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);

/**
 * The selected period so far, and the same stretch of the period before it ("Oct 1–25" vs "Sep 1–25"),
 * so a half-finished month is never compared with a whole one. null for "all time".
 */
export function comparison(range: Range, today: Date): { now: { start: string; end: string }; before: { start: string; end: string }; label: string } | null {
  if (!range.start) return null;
  const tomorrow = addDays(isoDate(today), 1);
  const end = tomorrow < range.end ? tomorrow : range.end;
  // the page already chose what to compare with, so every sentence uses that
  if (range.vs !== undefined) return range.vs && { now: { start: range.start, end }, before: { start: range.vs.start, end: range.vs.end }, label: range.vs.label };
  const s = parse(range.start);
  const months = range.months || 1;
  const prevStart = isoDate(new Date(s.getFullYear(), s.getMonth() - months, 1));
  const elapsed = daysBetween(range.start, end);
  const prevEndFull = range.start;
  const prevEnd = addDays(prevStart, elapsed) < prevEndFull ? addDays(prevStart, elapsed) : prevEndFull;
  const label = range.key === "year" ? "last year" : range.key === "quarter" ? "last quarter" : range.key === "month" ? "last month" : "the period before";
  return { now: { start: range.start, end }, before: { start: prevStart, end: prevEnd }, label };
}

/**
 * True when the data reaches back to the start of the earlier stretch. Without this, a household whose
 * history begins in August would be told it spent "326% more than last year".
 */
export function covers(lines: { date: string }[], cmp: NonNullable<ReturnType<typeof comparison>>): boolean {
  const firstMonth = addDays(cmp.before.start, 31);
  return lines.some((l) => l.date >= cmp.before.start && l.date < firstMonth);
}

export type Change = { key: string; now: number; before: number; delta: number };

/** Spending per top bucket now vs before, biggest moves first. */
export function changes(lines: LineLike[], cmp: NonNullable<ReturnType<typeof comparison>>): Change[] {
  const now = new Map(groupLines(lines.filter((l) => inRange(l.date, cmp.now)), "top_bucket", "spend").map((g) => [g.key, g.value]));
  const before = new Map(groupLines(lines.filter((l) => inRange(l.date, cmp.before)), "top_bucket", "spend").map((g) => [g.key, g.value]));
  return [...new Set([...now.keys(), ...before.keys()])]
    .map((key) => ({ key, now: now.get(key) ?? 0, before: before.get(key) ?? 0, delta: (now.get(key) ?? 0) - (before.get(key) ?? 0) }))
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Running total of spending for each day of a month: [day1, day1+day2, ...], stopping at `upTo` (exclusive). */
export function cumulative(lines: LineLike[], monthStart: string, upTo?: string): number[] {
  const s = parse(monthStart);
  const days = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const perDay = dailySpend(lines, monthStart);
  const out: number[] = [];
  let total = 0;
  for (let d = 1; d <= days; d++) {
    if (upTo && isoDate(new Date(s.getFullYear(), s.getMonth(), d)) >= upTo) break;
    total += perDay[d - 1];
    out.push(total);
  }
  return out;
}

/** Running total of spending for each day from `start` up to `end` (exclusive), stopping at `upTo`. Any length: a quarter, a year. */
export function cumulativeRange(lines: LineLike[], start: string, end: string, upTo?: string): number[] {
  const perDay = new Map<string, number>();
  for (const l of lines) if (l.date >= start && l.date < end) perDay.set(l.date, (perDay.get(l.date) ?? 0) + measureOf(l, "spend"));
  const out: number[] = [];
  let total = 0;
  for (let d = start; d < end && (!upTo || d < upTo); d = addDays(d, 1)) {
    total += perDay.get(d) ?? 0;
    out.push(total);
  }
  return out;
}

/** Spending on each day of the month containing `monthStart`, index 0 = the 1st. */
export function dailySpend(lines: LineLike[], monthStart: string): number[] {
  const s = parse(monthStart);
  const days = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const out = Array<number>(days).fill(0);
  const prefix = monthStart.slice(0, 7);
  for (const l of lines) if (l.date.startsWith(prefix)) out[Number(l.date.slice(8, 10)) - 1] += measureOf(l, "spend");
  return out;
}

/** Average spending per weekday (in the household's week order) across a date range, counting days with no spending as zero. */
export function weekdayAverages(lines: LineLike[], start: string, end: string): { day: string; value: number }[] {
  const totals = Array<number>(7).fill(0), counts = Array<number>(7).fill(0);
  for (let d = start; d < end; d = addDays(d, 1)) counts[weekdayIndex(parse(d))]++;
  for (const l of lines) if (l.date >= start && l.date < end) totals[weekdayIndex(parse(l.date))] += measureOf(l, "spend");
  return weekdayNames("short").map((day, i) => ({ day, value: counts[i] ? Math.round(totals[i] / counts[i]) : 0 }));
}

export type MerchantRow = { merchant: string; total: number; visits: number; average: number };

// the same place under its tidy name, so store numbers and card digits never split it
const merchantKey = (m: string) => tidyMerchant(m).toLowerCase();

export function merchants(lines: LineLike[]): MerchantRow[] {
  // one row per place, however the statement spelled it ("WAL-MART #3042", "WALMART.CA")
  const rows = new Map<string, MerchantRow>();
  const visits = new Map<string, Set<string>>();
  for (const l of lines) {
    const v = measureOf(l, "spend");
    if (!v) continue;
    const key = merchantKey(l.merchant);
    const r = rows.get(key) ?? { merchant: l.merchant, total: 0, visits: 0, average: 0 };
    r.total += v;
    rows.set(key, r);
    // a receipt split into three buckets is still one visit
    const seen = visits.get(key) ?? new Set<string>();
    seen.add(l.transaction_id ?? `${l.date}|${l.amount_cents}`);
    visits.set(key, seen);
  }
  return [...rows.entries()]
    .map(([key, r]) => ({ ...r, visits: visits.get(key)!.size, average: Math.round(r.total / visits.get(key)!.size) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type Flow = { month: string; income: number; spend: number; net: number };

export function cashflow(lines: LineLike[], months: string[]): Flow[] {
  return months.map((month) => {
    const ls = lines.filter((l) => l.month === month);
    const income = sumMeasure(ls, "income"), spend = sumMeasure(ls, "spend");
    return { month, income, spend, net: income - spend };
  });
}

/** A period's name at the end of a sentence: "last month", "in the last 12 months", "in September". */
const when = (label: string) => /^(this|last) (week|month|quarter|year)$/i.test(label) ? label.toLowerCase()
  : /^last \d/i.test(label) ? `in the ${label.toLowerCase()}` : `in ${label}`;

export type Insight = { tone: "good" | "warn" | "info"; icon: string; text: string };

/**
 * Short, specific sentences about the selected period, most useful first. Each one only appears when
 * the data supports it, so a quiet month gets fewer, never filler.
 */
export function buildInsights(input: {
  lines: LineLike[]; range: Range; today: Date; budgets: BudgetLike[]; buckets: BucketLike[];
}): Insight[] {
  const { lines, range, today, budgets, buckets } = input;
  const out: Insight[] = [];
  const found = comparison(range, today);
  const cmp = found && covers(lines, found) ? found : null;
  const inPeriod = lines.filter((l) => inRange(l.date, range));
  const money = (c: number) => formatCents(Math.round(c / 100) * 100, { sign: false, trim: true });
  // a finished period (looking back at September) is described as a whole, not "so far"
  const done = !!range.start && isoDate(today) >= addDays(range.end, -1);
  const atPoint = (label: string) => (done ? label : `at this point ${label}`);
  const during = done ? `in ${range.label}` : "so far this month";

  // pace: this period so far vs the same stretch last period
  if (cmp) {
    const now = sumMeasure(lines.filter((l) => inRange(l.date, cmp.now)), "spend");
    const before = sumMeasure(lines.filter((l) => inRange(l.date, cmp.before)), "spend");
    if (before > 0) {
      const diff = now - before;
      const pct = Math.round((Math.abs(diff) / before) * 100);
      if (pct >= 3) {
        out.push(diff < 0
          ? { tone: "good", icon: "trending-down", text: `You spent ${money(-diff)} less than ${atPoint(cmp.label)} (${pct}% lower).` }
          : { tone: "warn", icon: "trending-up", text: `Spending was ${money(diff)} more than ${atPoint(cmp.label)} (${pct}% higher).` });
      } else {
        out.push({ tone: "info", icon: "equal", text: `Spending is right in line with ${atPoint(cmp.label)}.` });
      }
    }
    // the bucket that moved the most
    const moved = changes(lines, cmp).find((c) => c.key !== "Uncategorized");
    if (moved && Math.abs(moved.delta) >= 2500) {
      out.push(moved.delta > 0
        ? { tone: "warn", icon: "arrow-up-right", text: `${moved.key} is up ${money(moved.delta)} on ${cmp.label}.` }
        : { tone: "good", icon: "arrow-down-right", text: `${moved.key} is down ${money(-moved.delta)} on ${cmp.label}.` });
    }
  }

  // projection and budget risk, only while the current month is under way
  if (range.key === "month" && range.start) {
    const day = today.getDate();
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    // fixed costs land early in the month, so project only the day-to-day part
    if (!done && day >= 5 && day < days) {
      const atRisk = buckets
        .filter((b) => !b.archived && !b.parent_id && b.kind === "spend")
        .map((b) => {
          const budget = budgetFor(budgets, b.id, range);
          const ids = new Set([b.id, ...buckets.filter((c) => c.parent_id === b.id).map((c) => c.id)]);
          const used = sumMeasure(inPeriod.filter((l) => l.bucket_id && ids.has(l.bucket_id)), "spend");
          const largest = Math.max(0, ...inPeriod.filter((l) => l.bucket_id && ids.has(l.bucket_id)).map((l) => measureOf(l, "spend")));
          return { b, budget, used, largest, projected: Math.round((used / day) * days) };
        })
        // a bucket that is mostly one fixed bill (rent, tuition) won't keep growing, so don't project it
        .filter((r) => r.budget && r.used < r.budget && r.largest < r.used * 0.5 && r.projected > r.budget * 1.05)
        .sort((a, b) => b.projected - b.budget! - (a.projected - a.budget!))[0];
      if (atRisk) out.push({ tone: "warn", icon: "gauge", text: `At this pace ${atRisk.b.name} ends near ${money(atRisk.projected)}, over its ${money(atRisk.budget!)} budget.` });
    }
    const over = buckets.filter((b) => !b.archived && !b.parent_id && b.kind === "spend").filter((b) => {
      const budget = budgetFor(budgets, b.id, range);
      if (!budget) return false;
      const ids = new Set([b.id, ...buckets.filter((c) => c.parent_id === b.id).map((c) => c.id)]);
      return sumMeasure(inPeriod.filter((l) => l.bucket_id && ids.has(l.bucket_id)), "spend") > budget;
    });
    if (over.length) {
      const who = over.length === 1 ? over[0].name : `${over.length} budgets`;
      out.push({ tone: "warn", icon: "circle-alert", text: done ? `${who} went over in ${range.label}.` : `${who} ${over.length === 1 ? "is" : "are"} already over for ${range.label}.` });
    }
    // nearly there: 80% or more of a budget used, not over yet
    const near = buckets.filter((b) => !b.archived && !b.parent_id && b.kind === "spend").map((b) => {
      const budget = budgetFor(budgets, b.id, range);
      const ids = new Set([b.id, ...buckets.filter((c) => c.parent_id === b.id).map((c) => c.id)]);
      const used = sumMeasure(inPeriod.filter((l) => l.bucket_id && ids.has(l.bucket_id)), "spend");
      return { b, budget, used };
    }).filter((r): r is { b: BucketLike; budget: number; used: number } => !!r.budget && r.used >= r.budget * 0.8 && r.used <= r.budget)
      .sort((a, b) => b.used / b.budget - a.used / a.budget);
    if (near.length) {
      const n = near[0];
      out.push(done
        ? { tone: "info", icon: "gauge", text: `${n.b.name} used ${Math.round((n.used / n.budget) * 100)}% of its budget${near.length > 1 ? `, and ${near.length - 1} more ended past 80%` : ""}.` }
        : { tone: "warn", icon: "gauge", text: `${n.b.name} has used ${Math.round((n.used / n.budget) * 100)}% of its budget, ${money(n.budget - n.used)} left${near.length > 1 ? `. ${near.length - 1} more ${near.length === 2 ? "is" : "are"} past 80%` : ""}.` });
    }
    // quiet days: no day-to-day spending at all
    const daily = dailySpend(lines, range.start).slice(0, day);
    const quiet = daily.filter((v) => v <= 0).length;
    if (quiet >= 2 && daily.some((v) => v > 0)) out.push({ tone: "good", icon: "sprout", text: `${quiet} no-spend days ${during}.` });
    // regular bills that haven't landed yet
    if (!done && isoDate(today) >= range.start && isoDate(today) < range.end) {
      const due = recurring(lines, today).filter((b) => b.paid === null && b.day >= day);
      if (due.length) {
        const total = due.reduce((s, b) => s + b.amount, 0);
        const named = due.slice(0, 2).map((b) => tidyMerchant(b.merchant)).join(" and ");
        out.push({ tone: "info", icon: "calendar-clock", text: `About ${money(total)} in regular bills is still to come this month${due.length <= 2 ? `: ${named}` : `, starting with ${named}`}.` });
      }
    }
  }

  // weekends against weekdays, over the last 12 weeks
  const weekEnd = addDays(isoDate(today), 1), weekStart = addDays(weekEnd, -84);
  if (lines.some((l) => l.date < addDays(weekStart, 14))) {
    const days = weekdayAverages(lines, weekStart, weekEnd);
    const weekday = days.slice(0, 5).reduce((s, d) => s + d.value, 0) / 5, weekend = (days[5].value + days[6].value) / 2;
    if (weekday > 0 && weekend > weekday * 1.25 && weekend - weekday >= 1000) {
      out.push({ tone: "info", icon: "calendar-days", text: `Weekends cost about ${money(weekend)} a day, against ${money(weekday)} on weekdays.` });
    }
  }

  // what's left after spending
  const income = sumMeasure(inPeriod, "income"), spend = sumMeasure(inPeriod, "spend");
  if (income > 0) {
    const kept = income - spend;
    out.push(kept >= 0
      ? { tone: "good", icon: "piggy-bank", text: `You kept ${Math.round((kept / income) * 100)}% of what came in (${money(kept)}).` }
      : { tone: "warn", icon: "scale", text: `${when(range.label).replace(/^\w/, (c) => c.toUpperCase())}, ${money(-kept)} more went out than came in.` });
  }

  // the single biggest purchase, a useful sanity check
  const biggest = inPeriod.filter((l) => l.kind === "spend" && l.amount_cents < 0).sort((a, b) => a.amount_cents - b.amount_cents)[0];
  if (biggest) out.push({ tone: "info", icon: "receipt", text: `Biggest purchase: ${tidyMerchant(biggest.merchant)}, ${money(-biggest.amount_cents)}.` });

  const subs = recurring(lines, today).filter((b) => b.bucket === "Subscriptions" || b.bucket === "Digital services");
  if (subs.length) {
    const monthly = subs.reduce((s, b) => s + b.amount, 0);
    out.push({ tone: "info", icon: "repeat", text: `Subscriptions cost ${money(monthly)} a month, about ${money(monthly * 12)} a year.` });
  }

  const top = merchants(inPeriod)[0];
  if (top && top.visits >= 4) out.push({ tone: "info", icon: "store", text: `${tidyMerchant(top.merchant)} is your most visited place: ${top.visits} visits, ${money(top.average)} on average.` });

  return out;
}

export type Bill = {
  merchant: string; bucket: string; amount: number; day: number;
  /** This month: the amount already seen, or null while it's still to come. */
  paid: number | null; paidOn: string | null;
};

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

/**
 * Regular bills: places charged in at least 3 of the last 4 full months, about once a month, for a steady
 * amount. Weekly grocery runs and coffee are left out by the once-a-month rule. Each bill says whether it
 * has already landed this month. With measure "income" it finds regular income instead, comparing monthly
 * totals, so twice-a-month pay qualifies.
 */
export function recurring(lines: LineLike[], today: Date, measure: "spend" | "income" = "spend"): Bill[] {
  const thisMonth = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const months = [4, 3, 2, 1].map((b) => isoDate(new Date(today.getFullYear(), today.getMonth() - b, 1)));
  // one charge per transaction, even when it was split across buckets
  type Charge = { key: string; merchant: string; bucket: string; date: string; month: string; value: number };
  const charges = new Map<string, Charge>();
  for (const l of lines) {
    if (l.exclude_from_recurring) continue;
    const v = measureOf(l, measure);
    if (v <= 0 || l.date < months[0]) continue;
    // income is judged by its monthly total, so pay that lands twice a month still counts as regular
    const id = measure === "income" ? `${merchantKey(l.merchant)}|${l.date.slice(0, 7)}` : l.transaction_id ?? `${l.date}|${l.merchant}`;
    const c = charges.get(id) ?? { key: merchantKey(l.merchant), merchant: l.merchant, bucket: l.top_bucket, date: l.date, month: `${l.date.slice(0, 7)}-01`, value: 0 };
    c.value += v;
    charges.set(id, c);
  }
  const byMerchant = new Map<string, Charge[]>();
  for (const c of charges.values()) byMerchant.set(c.key, [...(byMerchant.get(c.key) ?? []), c]);
  const bills: Bill[] = [];
  for (const list of byMerchant.values()) {
    const past = list.filter((c) => c.month < thisMonth);
    const seen = new Set(past.map((c) => c.month));
    if (seen.size < 3 || past.length > seen.size * 1.5) continue;
    const amounts = past.map((c) => c.value);
    const amount = median(amounts);
    // a bill costs about the same each time (hydro moves with the season, an Uber ride does not count)
    if (measure === "spend" && (Math.max(...amounts) > amount * 1.35 || Math.min(...amounts) < amount * 0.65)) continue;
    if (measure === "income" && (Math.max(...amounts) > amount * 1.6 || Math.min(...amounts) < amount * 0.6)) continue;
    // and lands around the same day each month (within about a week)
    if (measure === "spend") {
      // around month end, the 30th and the 2nd are four days apart, not 28
      const spread = (ds: number[]) => Math.max(...ds) - Math.min(...ds);
      const dayList = past.map((c) => Number(c.date.slice(8, 10)));
      if (Math.min(spread(dayList), spread(dayList.map((x) => (x < 15 ? x + 31 : x)))) > 8) continue;
    }
    const now = list.filter((c) => c.month === thisMonth).sort((a, b) => a.date.localeCompare(b.date));
    const latest = past.sort((a, b) => b.date.localeCompare(a.date))[0];
    bills.push({
      merchant: latest.merchant, bucket: latest.bucket, amount, day: median(past.map((c) => Number(c.date.slice(8, 10)))),
      paid: now.length ? now.reduce((s, c) => s + c.value, 0) : null, paidOn: now.at(-1)?.date ?? null,
    });
  }
  return bills.sort((a, b) => a.day - b.day || b.amount - a.amount);
}

/** Share of income kept each month (kept / income), or null for a month with no income. */
export function savingsRates(lines: LineLike[], months: string[]): { month: string; rate: number | null; kept: number; income: number }[] {
  return cashflow(lines, months).map((f) => ({ month: f.month, kept: f.net, income: f.income, rate: f.income > 0 ? f.net / f.income : null }));
}

/** Spending per top bucket per month, biggest buckets first: rows for the bucket × month heatmap. */
export function bucketMonths(lines: LineLike[], months: string[], top: number): { bucket: string; values: number[]; total: number }[] {
  const index = new Map(months.map((m, i) => [m, i]));
  const rows = new Map<string, number[]>();
  for (const l of lines) {
    const i = index.get(l.month);
    const v = measureOf(l, "spend");
    if (i === undefined || !v) continue;
    const row = rows.get(l.top_bucket) ?? Array<number>(months.length).fill(0);
    row[i] += v;
    rows.set(l.top_bucket, row);
  }
  return [...rows.entries()]
    .map(([bucket, values]) => ({ bucket, values, total: values.reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, top);
}

/**
 * The long view for the Plan page: a typical month, how long savings would last, what is rising, where
 * income comes from and the best month. Uses whole months only, and needs at least three of them.
 */
export function buildOutlook(input: { lines: LineLike[]; today: Date; netWorth: number | null }): Insight[] {
  const { lines, today, netWorth } = input;
  const all = Array.from({ length: 12 }, (_, i) => isoDate(new Date(today.getFullYear(), today.getMonth() - 12 + i, 1)));
  const months = all.filter((m) => lines.some((l) => l.month === m));
  if (months.length < 3) return [];
  const money = (c: number) => formatCents(Math.round(c / 100) * 100, { sign: false, trim: true });
  const name = (m: string) => parse(m).toLocaleDateString(LOCALE, { month: "long" });
  // the finished months these sentences cover, named, so they never read as the dates chosen on the page
  const short = (m: string) => parse(m).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
  const span = `${short(months[0])} to ${short(months.at(-1)!)}`;
  const flow = cashflow(lines, months);
  const income = flow.reduce((s, f) => s + f.income, 0), spend = flow.reduce((s, f) => s + f.spend, 0);
  const avgIn = income / months.length, avgOut = spend / months.length;
  const out: Insight[] = [];

  out.push({ tone: "info", icon: "calendar-range", text: `A typical month brings in ${money(avgIn)} and sends out ${money(avgOut)}.` });
  if (income > 0) {
    const kept = income - spend;
    out.push(kept >= 0
      ? { tone: "good", icon: "piggy-bank", text: `From ${span} you kept ${Math.round((kept / income) * 100)}% of what came in, ${money(kept)} in all.` }
      : { tone: "warn", icon: "scale", text: `From ${span}, ${money(-kept)} more went out than came in.` });
  }
  if (netWorth !== null && netWorth > 0 && avgOut > 0) {
    const cover = netWorth / avgOut;
    out.push({
      tone: cover >= 3 ? "good" : "warn", icon: "shield",
      text: cover >= 1
        ? `What you have now would cover about ${cover >= 10 ? Math.round(cover) : cover.toFixed(1).replace(/\.0$/, "")} months of typical spending.`
        : `What you have now would cover about ${Math.round(cover * 30)} days of typical spending.`,
    });
  }
  // what is rising: the last three months against the three before
  if (months.length >= 6) {
    const recent = months.slice(-3), earlier = months.slice(-6, -3);
    const avg = (ms: string[], key: string) => sumMeasure(lines.filter((l) => ms.includes(l.month) && l.top_bucket === key), "spend") / 3;
    const keys = [...new Set(lines.filter((l) => l.kind === "spend" && l.top_bucket !== "Uncategorized").map((l) => l.top_bucket))];
    const moves = keys.map((k) => ({ k, now: avg(recent, k), before: avg(earlier, k) }))
      .filter((m) => m.before > 0 && Math.abs(m.now - m.before) >= 5000 && Math.abs(m.now - m.before) / m.before >= 0.15)
      .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));
    const up = moves.find((m) => m.now > m.before), down = moves.find((m) => m.now < m.before);
    if (up) out.push({ tone: "warn", icon: "trending-up", text: `${up.k} averaged ${money(up.now)} a month lately, up ${Math.round(((up.now - up.before) / up.before) * 100)}% on the three months before.` });
    if (down) out.push({ tone: "good", icon: "trending-down", text: `${down.k} averaged ${money(down.now)} a month lately, down ${Math.round(((down.before - down.now) / down.before) * 100)}% on the three months before.` });
  }
  const inPeriod = lines.filter((l) => months.includes(l.month));
  const costs = groupLines(inPeriod, "top_bucket", "spend").filter((g) => g.key !== "Uncategorized");
  if (costs[0] && spend > 0) out.push({ tone: "info", icon: "chart-pie", text: `${costs[0].key} is the biggest cost: ${money(costs[0].value)} from ${span}, ${Math.round((costs[0].value / spend) * 100)}% of all spending.` });
  const sources = groupLines(inPeriod, "top_bucket", "income").filter((g) => g.value > 0);
  if (sources.length >= 2 && income > 0) {
    const pct = (v: number) => Math.round((v / income) * 100);
    out.push({ tone: "info", icon: "hand-coins", text: `${sources[0].key} brings in ${pct(sources[0].value)}% of income, and ${sources[1].key} another ${pct(sources[1].value)}%.` });
  }
  const best = flow.reduce((a, b) => (b.net > a.net ? b : a), flow[0]);
  if (best.net > 0 && flow.length >= 4) out.push({ tone: "good", icon: "trophy", text: `Best month: ${name(best.month)}, with ${money(best.net)} kept.` });
  return out;
}

/** Account kinds whose money is spent day to day; credit cards count as money already spent. */
export const EVERYDAY = ["chequing", "savings", "cash", "credit_card"];

export type CurrentBalance = { id: string; name: string; kind: string; is_debt: boolean; balance: number; asOf: string; stale: boolean };

/**
 * Each account's balance right now: its latest recorded balance plus every transaction dated after it.
 * Debts (cards, loans) are the amount owed, as a positive number. `stale` means the loaded history starts
 * after the balance date, so some transactions since may be missing.
 */
export function currentBalances(input: {
  lines: (LineLike & { account_id?: string })[];
  accounts: { id: string; name?: string; kind: string; is_debt: boolean; archived: boolean }[];
  balances: { account_id: string; date: string; balance_cents: number }[];
}): CurrentBalance[] {
  const latest = new Map<string, { date: string; balance_cents: number }>();
  for (const b of input.balances) if (!latest.get(b.account_id) || latest.get(b.account_id)!.date <= b.date) latest.set(b.account_id, b);
  const loadedFrom = input.lines.reduce((m, l) => (l.date < m ? l.date : m), "9999-12-31");
  return input.accounts.filter((a) => !a.archived && latest.has(a.id)).map((a) => {
    const b = latest.get(a.id)!;
    // balances are end-of-day, so only later transactions move them
    const since = input.lines.filter((l) => l.account_id === a.id && l.date > b.date).reduce((s, l) => s + l.amount_cents, 0);
    return { id: a.id, name: a.name ?? "", kind: a.kind, is_debt: a.is_debt, balance: a.is_debt ? b.balance_cents - since : b.balance_cents + since, asOf: b.date, stale: b.date < loadedFrom };
  });
}

export type Forecast = {
  today: number; asOf: string; stale: boolean;
  income: { name: string; amount: number }[]; bills: { name: string; amount: number }[];
  everyday: { perDay: number; days: number; total: number };
  end: number;
};

/**
 * Where the everyday accounts land at the end of the month: what is in them today (latest balance plus every
 * transaction since), plus regular income still to come, minus regular bills still to come, minus the usual
 * day-to-day spending for the days that are left. Credit cards count as money already spent.
 */
export function forecastMonth(input: {
  lines: (LineLike & { account_id?: string })[]; today: Date;
  accounts: { id: string; name?: string; kind: string; is_debt: boolean; archived: boolean }[];
  balances: { account_id: string; date: string; balance_cents: number }[];
}): Forecast | null {
  const { lines, today, accounts, balances } = input;
  const everyday = currentBalances({ lines, accounts, balances }).filter((r) => EVERYDAY.includes(r.kind));
  if (everyday.length === 0) return null;
  const now = everyday.reduce((s, r) => s + (r.is_debt ? -r.balance : r.balance), 0);
  const asOf = everyday.reduce((m, r) => (r.asOf < m ? r.asOf : m), isoDate(today));
  const stale = everyday.some((r) => r.stale);
  const day = today.getDate();
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const thisMonth = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  // regular income: the usual monthly total from each source, minus what has already arrived this month
  const income = recurring(lines, today, "income").map((b) => {
    const usual = ["1", "2", "3"].map((n) => isoDate(new Date(today.getFullYear(), today.getMonth() - Number(n), 1)))
      .map((m) => sumMeasure(lines.filter((l) => l.month === m && l.merchant === b.merchant), "income"));
    const got = sumMeasure(lines.filter((l) => l.month === thisMonth && l.merchant === b.merchant), "income");
    return { name: b.merchant, amount: Math.max(0, median(usual) - got) };
  }).filter((r) => r.amount > 0);
  const regular = recurring(lines, today);
  const bills = regular.filter((b) => b.paid === null && b.day >= day).map((b) => ({ name: b.merchant, amount: b.amount }));
  // day-to-day spending: the last 90 days, leaving out regular bills
  const billNames = new Set(regular.map((b) => merchantKey(b.merchant)));
  const from = addDays(isoDate(today), -90);
  const daily = lines.filter((l) => l.date >= from && l.date <= isoDate(today) && !billNames.has(merchantKey(l.merchant)))
    .reduce((s, l) => s + measureOf(l, "spend"), 0) / 90;
  const left = days - day;
  const spendLeft = Math.round(daily * left);
  const end = now + income.reduce((s, r) => s + r.amount, 0) - bills.reduce((s, r) => s + r.amount, 0) - spendLeft;
  return { today: now, asOf, stale, income, bills, everyday: { perDay: Math.round(daily), days: left, total: spendLeft }, end };
}

export type Debt = { name: string; balance: number; apr: number; minimum: number };
export type Payoff = {
  months: number | null; interest: number; order: { name: string; month: number }[];
};

/**
 * Pays debts down month by month. Every debt gets its minimum; the extra (plus the minimum of every debt
 * already cleared) goes to one target: the highest interest rate (avalanche) or the smallest balance (snowball).
 * months is null when the payments never catch up with the interest.
 */
export function payoffPlan(debts: Debt[], extra: number, method: "avalanche" | "snowball"): Payoff {
  const left = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const order: Payoff["order"] = [];
  let interest = 0;
  const budget = left.reduce((s, d) => s + d.minimum, 0) + extra;
  for (let month = 1; month <= 600; month++) {
    const open = left.filter((d) => d.balance > 0);
    if (open.length === 0) return { months: month - 1, interest: Math.round(interest), order };
    for (const d of open) {
      const charge = d.balance * (d.apr / 100 / 12);
      interest += charge;
      d.balance += charge;
    }
    let pot = budget;
    for (const d of open) {
      const pay = Math.min(d.minimum, d.balance, pot);
      d.balance -= pay;
      pot -= pay;
    }
    const targets = open.filter((d) => d.balance > 0.5)
      .sort((a, b) => (method === "avalanche" ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr));
    for (const d of targets) {
      if (pot <= 0) break;
      const pay = Math.min(d.balance, pot);
      d.balance -= pay;
      pot -= pay;
    }
    for (const d of open) if (d.balance <= 0.5 && !order.some((o) => o.name === d.name)) { d.balance = 0; order.push({ name: d.name, month }); }
  }
  const clear = left.every((d) => d.balance <= 0);
  return { months: clear ? order.at(-1)?.month ?? 0 : null, interest: Math.round(interest), order };
}

// ---------------------------------------------------------------------------
// Patterns for the Analysis tab. Each finder only reports what the data clearly shows.
// ---------------------------------------------------------------------------

type Charge = { key: string; merchant: string; bucket: string; date: string; month: string; value: number };

/** One charge per transaction (splits added up), money out only. */
function chargesOf(lines: LineLike[], since: string, until: string): Charge[] {
  const byTx = new Map<string, Charge>();
  for (const l of lines) {
    const v = measureOf(l, "spend");
    if (v <= 0 || l.date < since || l.date >= until) continue;
    const id = l.transaction_id ?? `${l.date}|${l.merchant}|${l.amount_cents}`;
    const c = byTx.get(id) ?? { key: merchantKey(l.merchant), merchant: l.merchant, bucket: l.top_bucket, date: l.date, month: `${l.date.slice(0, 7)}-01`, value: 0 };
    c.value += v;
    byTx.set(id, c);
  }
  return [...byTx.values()];
}

export type PriceChange = { merchant: string; bucket: string; before: number; now: number; since: string };

/**
 * Regular charges that went up: charged in at least 5 of the last 7 months and 6 months in all, about once a
 * month, at a steady price (every earlier charge within 8% of the first), and the last two charges are at
 * least 4% (and $1) above the first two. Occasional purchases at the same place never qualify.
 */
export function priceCreep(lines: LineLike[], today: Date): PriceChange[] {
  const since = isoDate(new Date(today.getFullYear(), today.getMonth() - 15, 1));
  const groups = new Map<string, Charge[]>();
  for (const c of chargesOf(lines, since, addDays(isoDate(today), 1))) groups.set(c.key, [...(groups.get(c.key) ?? []), c]);
  const out: PriceChange[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((c) => c.month));
    const recent = new Set(Array.from({ length: 7 }, (_, i) => isoDate(new Date(today.getFullYear(), today.getMonth() - i, 1))));
    if (months.size < 6 || [...months].filter((m) => recent.has(m)).length < 5 || list.length > months.size * 1.25) continue;
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date));
    const before = median(sorted.slice(0, 2).map((c) => c.value)), now = median(sorted.slice(-2).map((c) => c.value));
    const earlier = sorted.filter((c) => c.value < (before + now) / 2);
    const steady = earlier.length >= 3 && earlier.every((c) => Math.abs(c.value - before) <= before * 0.08);
    if (!steady || now < before * 1.04 || now - before < 100) continue;
    const firstHigher = sorted.find((c) => c.value >= (before + now) / 2)!;
    out.push({ merchant: sorted.at(-1)!.merchant, bucket: sorted.at(-1)!.bucket, before, now, since: firstHigher.date });
  }
  return out.sort((a, b) => (b.now - b.before) * 12 - (a.now - a.before) * 12);
}

export type Spike = { merchant: string; date: string; amount: number; usual: number };

/** Charges in the window at least 2.5× (and $20 over) what that place usually costs, from 3+ earlier visits. */
export function spikes(lines: LineLike[], from: string, to: string): Spike[] {
  const all = chargesOf(lines, "1900-01-01", to);
  const out: Spike[] = [];
  for (const c of all.filter((x) => x.date >= from)) {
    const earlier = all.filter((x) => x.key === c.key && x.date < c.date).map((x) => x.value);
    if (earlier.length < 3) continue;
    const usual = median(earlier);
    if (c.value >= usual * 2.5 && c.value - usual >= 2000) out.push({ merchant: c.merchant, date: c.date, amount: c.value, usual });
  }
  return out.sort((a, b) => b.amount - b.usual - (a.amount - a.usual)).slice(0, 6);
}

export type OneOffs = { items: { merchant: string; bucket: string; date: string; amount: number }[]; total: number; months: number; typical: number; withAll: number };

/**
 * Big irregular costs in the window: $150 or more, at a place visited at most twice in the past year and not a
 * regular bill. Also what an average month looks like with and without them.
 */
export function oneOffs(lines: LineLike[], from: string, to: string, today: Date): OneOffs {
  const yearAgo = addDays(from, -365);
  const charges = chargesOf(lines, yearAgo, to);
  const bills = new Set(recurring(lines, today).map((b) => merchantKey(b.merchant)));
  const visits = new Map<string, number>();
  for (const c of charges) visits.set(c.key, (visits.get(c.key) ?? 0) + 1);
  const inWindow = charges.filter((c) => c.date >= from);
  const items = inWindow.filter((c) => c.value >= 15000 && (visits.get(c.key) ?? 0) <= 2 && !bills.has(c.key))
    .sort((a, b) => b.value - a.value).map((c) => ({ merchant: c.merchant, bucket: c.bucket, date: c.date, amount: c.value }));
  const months = Math.max(1, new Set(inWindow.map((c) => c.month)).size);
  const withAll = inWindow.reduce((s, c) => s + c.value, 0) / months;
  const total = items.reduce((s, c) => s + c.amount, 0);
  return { items: items.slice(0, 8), total, months, typical: Math.round(withAll - total / months), withAll: Math.round(withAll) };
}

export type Season = { month: number; average: number; years: number };

/** Average spending in each calendar month across every full month on record (needs a year of history). */
export function seasonal(lines: LineLike[], today: Date): Season[] | null {
  const current = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const totals = new Map<string, number>();
  for (const l of lines) if (l.month < current) totals.set(l.month, (totals.get(l.month) ?? 0) + measureOf(l, "spend"));
  if (totals.size < 12) return null;
  const by = Array.from({ length: 12 }, () => [] as number[]);
  for (const [m, v] of totals) by[Number(m.slice(5, 7)) - 1].push(v);
  return by.map((vs, month) => ({ month, average: vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : 0, years: vs.length }));
}

export type IncomeSource = { name: string; days: number[]; monthly: number; lastDate: string };

/** When each regular income source usually lands (days of the month) and its usual monthly total. */
export function incomeCalendar(lines: LineLike[], today: Date): IncomeSource[] {
  return recurring(lines, today, "income").map((b) => {
    const key = merchantKey(b.merchant);
    const hits = lines.filter((l) => merchantKey(l.merchant) === key && measureOf(l, "income") > 0);
    const days = [...new Set(hits.map((l) => Number(l.date.slice(8, 10))))];
    // keep the days that come up in at least a third of the months
    const months = new Set(hits.map((l) => l.month)).size;
    const common = days.filter((d) => hits.filter((l) => Math.abs(Number(l.date.slice(8, 10)) - d) <= 2).length >= months / 3);
    const merged = common.sort((a, b) => a - b).filter((d, i, arr) => i === 0 || d - arr[i - 1] > 3);
    return { name: b.merchant, days: merged, monthly: b.amount, lastDate: hits.map((l) => l.date).sort().at(-1) ?? "" };
  }).sort((a, b) => b.monthly - a.monthly);
}
