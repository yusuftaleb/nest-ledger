import { LOCALE } from "./format.ts";
import { isoDate } from "./dates.ts";

// The dashboard is data: each `widgets` row names a type and a spec (measure, group_by, period, filter).
// These pure functions turn rows of the `lines` view into the numbers a widget draws.

/** "custom" is any stretch of dates, e.g. the Analysis page's "last 12 months" or "since March". */
export type PeriodKey = "month" | "quarter" | "year" | "all" | "custom";
export type Range = {
  key: PeriodKey; start: string | null; end: string; label: string; months: number;
  /** What the page compares these dates with (Analysis): the earlier dates and their name, or null for nothing. */
  vs?: { start: string; end: string; label: string } | null;
};

type LineLike = {
  date: string; month: string; merchant: string; amount_cents: number; account: string; bucket_id: string | null;
  bucket: string; top_bucket: string; kind: string; person: string | null; tags: string[];
};
type BucketLike = { id: string; name: string; parent_id: string | null };
type BudgetLike = { bucket_id: string; amount_cents: number; period: string; starts: string; ends: string | null; attrs?: Record<string, unknown> | null };

export type Filter = { buckets?: string[]; accounts?: string[]; kinds?: string[]; people?: string[]; tags?: string[] };
export type Group = { key: string; value: number; bucketId: string | null };

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

export function asPeriod(value: unknown, fallback: PeriodKey = "month"): PeriodKey {
  return value === "month" || value === "quarter" || value === "year" || value === "all" ? value : fallback;
}

/** The current month, quarter or year containing `today`; `end` is exclusive. */
export function periodRange(key: PeriodKey, today: Date): Range {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (key === "all") return { key, start: null, end: isoDate(new Date(y, m + 1, 1)), label: "All time", months: 0 };
  if (key === "year") return { key, start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y), months: 12 };
  if (key === "quarter") {
    const q = Math.floor(m / 3);
    return { key, start: isoDate(new Date(y, q * 3, 1)), end: isoDate(new Date(y, q * 3 + 3, 1)), label: `Q${q + 1} ${y}`, months: 3 };
  }
  const label = today.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  return { key, start: isoDate(new Date(y, m, 1)), end: isoDate(new Date(y, m + 1, 1)), label, months: 1 };
}

/**
 * The period to show: the one containing `at` (any date inside it, YYYY-MM-DD), or the current one.
 * `anchor` is the "today" every card measures from: the real today for the current period, the period's
 * last day for a past one, so a finished month reads as finished. Future periods fall back to the current one.
 */
export function periodAt(key: PeriodKey, at: string | undefined, now: Date): { range: Range; anchor: Date; live: boolean } {
  const current = periodRange(key, now);
  const parsed = at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? new Date(`${at}T12:00`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || key === "all") return { range: current, anchor: now, live: true };
  const range = periodRange(key, parsed);
  if (!range.start || range.start >= current.end) return { range: current, anchor: now, live: true };
  if (range.start === current.start) return { range: current, anchor: now, live: true };
  const [y, m, d] = range.end.split("-").map(Number);
  return { range, anchor: new Date(y, m - 1, d - 1, 12), live: false };
}

/** The first day of the period `steps` before (negative) or after (positive) `range`. */
export function stepPeriod(range: Range, steps: number): string {
  const [y, m] = (range.start ?? range.end).split("-").map(Number);
  return isoDate(new Date(y, m - 1 + steps * (range.months || 1), 1));
}

/** First days of the last `n` months, oldest first, ending with the month of `today`. */
/** The first day of each of the last n months, ending with today's month (at most 20 years). */
export function lastMonths(n: number, today: Date): string[] {
  const len = Math.max(1, Math.min(n, 240));
  return Array.from({ length: len }, (_, i) => isoDate(new Date(today.getFullYear(), today.getMonth() - (len - 1 - i), 1)));
}

export const inRange = (date: string, r: { start: string | null; end: string }) => (!r.start || date >= r.start) && date < r.end;

/**
 * What one line adds to a measure. spend: money out in spend buckets (refunds reduce it), as a positive number.
 * income: money in from income buckets. net: income minus spend. total: the raw signed sum of everything.
 * Transfers, savings and goals are never spending or income.
 */
export function measureOf(line: { kind: string; amount_cents: number }, measure: string): number {
  switch (measure) {
    case "income": return line.kind === "income" ? line.amount_cents : 0;
    case "net": return line.kind === "income" || line.kind === "spend" ? line.amount_cents : 0;
    case "total": return line.amount_cents;
    default: return line.kind === "spend" ? -line.amount_cents : 0;
  }
}

/** The ids of the named buckets and all their children, grandchildren and so on. Names match case-insensitively. */
export function bucketsUnder(names: string[], buckets: BucketLike[]): Set<string> {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const ids = new Set(buckets.filter((b) => wanted.has(b.name.toLowerCase())).map((b) => b.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const b of buckets) {
      if (b.parent_id && ids.has(b.parent_id) && !ids.has(b.id)) { ids.add(b.id); grew = true; }
    }
  }
  return ids;
}

export function applyFilter<L extends LineLike>(lines: L[], filter: Filter | undefined, buckets: BucketLike[]): L[] {
  if (!filter) return lines;
  const lower = (list?: unknown) => (Array.isArray(list) && list.length ? new Set(list.map((x) => String(x).toLowerCase())) : null);
  const bucketIds = Array.isArray(filter.buckets) && filter.buckets.length ? bucketsUnder(filter.buckets.map(String), buckets) : null;
  const uncategorized = filter.buckets?.some((n) => String(n).toLowerCase() === "uncategorized");
  const accounts = lower(filter.accounts), kinds = lower(filter.kinds), people = lower(filter.people), tags = lower(filter.tags);
  return lines.filter((l) =>
    (!bucketIds || (l.bucket_id ? bucketIds.has(l.bucket_id) : !!uncategorized)) &&
    (!accounts || accounts.has(l.account.toLowerCase())) &&
    (!kinds || kinds.has(l.kind.toLowerCase())) &&
    (!people || people.has((l.person ?? "").toLowerCase())) &&
    (!tags || l.tags.some((t) => tags.has(t.toLowerCase()))),
  );
}

/** Sums a measure per group, biggest first; groups that add up to zero are left out. */
export function groupLines(lines: LineLike[], groupBy: string, measure: string): Group[] {
  const groups = new Map<string, Group>();
  for (const l of lines) {
    const value = measureOf(l, measure);
    if (!value) continue;
    const [key, bucketId] =
      groupBy === "top_bucket" ? [l.top_bucket, null] :
      groupBy === "account" ? [l.account, null] :
      groupBy === "person" ? [l.person ?? "Someone else", null] :
      groupBy === "merchant" ? [l.merchant, null] :
      groupBy === "month" ? [l.month, null] :
      groupBy === "kind" ? [l.kind, null] :
      [l.bucket, l.bucket_id];
    const g = groups.get(key) ?? { key, value: 0, bucketId };
    g.value += value;
    groups.set(key, g);
  }
  const list = [...groups.values()].filter((g) => g.value !== 0);
  return groupBy === "month" ? list.sort((a, b) => a.key.localeCompare(b.key)) : list.sort((a, b) => b.value - a.value);
}

export const sumMeasure = (lines: LineLike[], measure: string) => lines.reduce((s, l) => s + measureOf(l, measure), 0);

const PER_MONTH: Record<string, number> = { week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 };

/**
 * The budget for a bucket over a range: the row with the latest start that overlaps the range,
 * converted to the range's length (a $600/month budget is $1,800 for a quarter). null = no budget.
 */
export function budgetFor(budgets: BudgetLike[], bucketId: string, range: Range): number | null {
  const months = range.months || 1;
  const row = budgets
    .filter((b) => b.bucket_id === bucketId && b.starts < range.end && (!b.ends || !range.start || b.ends >= range.start))
    .sort((a, b) => b.starts.localeCompare(a.starts))[0];
  if (!row) return null;
  return Math.round(row.amount_cents * (PER_MONTH[row.period] ?? 1) * months);
}

/** The budget row that governs a bucket in a range, as `budgetFor` picks it. */
function budgetRow(budgets: BudgetLike[], bucketId: string, range: { start: string | null; end: string }) {
  return budgets
    .filter((b) => b.bucket_id === bucketId && b.starts < range.end && (!b.ends || !range.start || b.ends >= range.start))
    .sort((a, b) => b.starts.localeCompare(a.starts))[0];
}

/**
 * Rollover: what a monthly budget carries into `month` from the months before it. Each earlier month whose budget
 * has `attrs.rollover` adds what was left (or takes away what went over); a month without a rolling budget starts
 * the count again from zero. At most `back` months are counted. `spentIn` gives the bucket's spending in a month.
 */
export function carryInto(budgets: BudgetLike[], bucketId: string, month: string, spentIn: (start: string, end: string) => number, back = 12): number {
  const shift = (iso: string, n: number) => {
    const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + n;
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  // this month's own budget must roll over for anything to arrive in it
  if (budgetRow(budgets, bucketId, { start: month, end: shift(month, 1) })?.attrs?.rollover !== true) return 0;
  let carry = 0;
  for (let k = back; k >= 1; k--) {
    const start = shift(month, -k), end = shift(month, -k + 1);
    const row = budgetRow(budgets, bucketId, { start, end });
    if (!row || row.attrs?.rollover !== true) { carry = 0; continue; }
    carry += Math.round(row.amount_cents * (PER_MONTH[row.period] ?? 1)) - spentIn(start, end);
  }
  return carry;
}
