import { LOCALE, weekdayIndex, weekdayNames } from "./format.ts";
import { addDaysIso, addMonths, isoDate, parseIso } from "./dates.ts";
import { tidyMerchant } from "./merchant.ts";
import { measureOf } from "./dashboard.ts";

// The Analysis tab's maths: which dates a view covers, the stretch it is compared with, and lines grouped by
// any dimension. Pure functions over rows of the `lines` view, so the browser can re-slice instantly.

export const GROUPS = {
  top_bucket: "Bucket", bucket: "Sub-bucket", merchant: "Place", account: "Account", person: "Person",
  month: "Month", weekday: "Day of week", day: "Day of month",
} as const;
export const MEASURES = { spend: "Spending", income: "Money in", net: "Net", count: "Transactions" } as const;

export type GroupKey = keyof typeof GROUPS;
export type MeasureKey = keyof typeof MEASURES;
/** No comparison, the previous period, or the same time last year. */
export type CompareKey = "none" | "prev" | "year";

export const asGroup = (v: unknown): GroupKey => (typeof v === "string" && v in GROUPS ? (v as GroupKey) : "top_bucket");
export const asMeasure = (v: unknown): MeasureKey => (typeof v === "string" && v in MEASURES ? (v as MeasureKey) : "spend");

export type Window = { from: string | null; to: string; label: string };

/** "Every October" or "average" asks across years: the view opens on Year by year, over all the history. */
export const acrossYears = (s: { monthOfYear?: number; average?: boolean }) => s.monthOfYear !== undefined || !!s.average;

/**
 * The dates a view covers: the search's date if it has one, otherwise the last 12 months including this one, or all
 * the history when the search asks across years.
 */
export function windowOf(slice: { from?: string; to?: string; dateLabel?: string; monthOfYear?: number; average?: boolean }, today: Date): Window {
  const tomorrow = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  if (slice.from && slice.to) {
    return { from: slice.from === "1900-01-01" ? null : slice.from, to: slice.to < tomorrow ? slice.to : tomorrow, label: slice.dateLabel ?? "Selected dates" };
  }
  if (acrossYears(slice)) {
    const m = slice.monthOfYear;
    return { from: null, to: tomorrow, label: m === undefined ? "All time" : `Every ${parseIso(`2000-${String(m + 1).padStart(2, "0")}-01`).toLocaleDateString(LOCALE, { month: "long" })}` };
  }
  return { from: isoDate(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to: tomorrow, label: "Last 12 months" };
}

/** The stretch to compare with: the same length just before, or the same dates a year earlier. */
export function compareWindow(w: Window, mode: CompareKey): Window | null {
  if (mode === "none" || !w.from) return null;
  if (mode === "year") return { from: addMonths(w.from, -12), to: addMonths(w.to, -12), label: "same time last year" };
  // whole months step back by whole months, so "September" compares with "August", not the 31 days before
  const whole = w.from.endsWith("-01") && w.to.endsWith("-01");
  if (whole) {
    const a = parseIso(w.from), b = parseIso(w.to);
    const n = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    return { from: addMonths(w.from, -n), to: w.from, label: "the period before" };
  }
  const days = Math.round((parseIso(w.to).getTime() - parseIso(w.from).getTime()) / 86_400_000);
  return { from: isoDate(new Date(parseIso(w.from).getTime() - days * 86_400_000)), to: w.from, label: "the period before" };
}

/** Whole and part months in a window, for "per month" averages (at least 1). */
export function monthsIn(w: Window, lines: { date: string }[]): number {
  const from = w.from ?? lines.reduce((m, l) => (l.date < m ? l.date : m), w.to);
  const a = parseIso(from), b = parseIso(w.to);
  const days = (b.getTime() - a.getTime()) / 86_400_000;
  return Math.max(1, Math.round((days / 30.44) * 10) / 10);
}

export type ExploreLine = {
  /** The month it counts for, YYYY-MM-01: its own, or the next one when a month rule says so (rent sent early). */
  month?: string;
  date: string; merchant: string; amount_cents: number; bucket_id: string | null; bucket: string; top_bucket: string;
  kind: string; account_id: string; account: string; person: string | null; transaction_id: string;
};
export type Row = { key: string; label: string; value: number; count: number; bucketId: string | null };

const WEEKDAYS = weekdayNames("long");

function keyOf(l: ExploreLine, g: GroupKey): { key: string; label: string } {
  switch (g) {
    case "bucket": return { key: l.bucket, label: l.bucket };
    case "merchant": return { key: tidyMerchant(l.merchant).toLowerCase(), label: tidyMerchant(l.merchant) };
    case "account": return { key: l.account, label: l.account };
    case "person": return { key: l.person ?? "Unknown", label: l.person ?? "Unknown" };
    case "month": {
      const m = l.date.slice(0, 7);
      return { key: m, label: parseIso(`${m}-01`).toLocaleDateString(LOCALE, { month: "short", year: "numeric" }) };
    }
    case "weekday": { const i = weekdayIndex(parseIso(l.date)); return { key: String(i), label: WEEKDAYS[i] }; }
    case "day": return { key: l.date.slice(8, 10), label: String(Number(l.date.slice(8, 10))) };
    default: return { key: l.top_bucket, label: l.top_bucket };
  }
}

/** What one line adds: spending and money in as positive numbers, net as in minus out, count as 0 (counted per transaction). */
const valueOf = (l: ExploreLine, m: MeasureKey) => (m === "count" ? 0 : measureOf(l, m));
const relevant = (l: ExploreLine, m: MeasureKey) =>
  m === "spend" ? l.kind === "spend" : m === "income" ? l.kind === "income" : m === "net" ? l.kind === "spend" || l.kind === "income" : l.kind === "spend" || l.kind === "income";

/** Lines grouped by one dimension: total, number of transactions, and the bucket id for colour when there is one. */
export function groupBy(lines: ExploreLine[], g: GroupKey, m: MeasureKey): Row[] {
  const rows = new Map<string, Row & { tx: Set<string> }>();
  for (const l of lines) {
    if (!relevant(l, m)) continue;
    const { key, label } = keyOf(l, g);
    const r = rows.get(key) ?? { key, label, value: 0, count: 0, bucketId: g === "bucket" ? l.bucket_id : null, tx: new Set<string>() };
    r.value += valueOf(l, m);
    r.tx.add(l.transaction_id);
    rows.set(key, r);
  }
  return [...rows.values()].map(({ tx, ...r }) => ({ ...r, count: tx.size, value: m === "count" ? tx.size : r.value }));
}

/** The headline numbers for a set of lines. */
export function totals(lines: ExploreLine[], m: MeasureKey) {
  const rel = lines.filter((l) => relevant(l, m));
  const tx = new Set(rel.map((l) => l.transaction_id));
  const value = m === "count" ? tx.size : rel.reduce((s, l) => s + valueOf(l, m), 0);
  return { value, transactions: tx.size };
}

/** Natural order for time-like groups; everything else by size. */
export function naturalOrder(g: GroupKey) {
  return g === "month" || g === "weekday" || g === "day";
}

export type Slot = { key: string; label: string; long: string; from: string; to: string; /** For narrow charts: a letter or a day number. */ short: string };

/**
 * Time slots across a window, sized so a chart has a sensible number of columns:
 * days for up to five weeks, weeks for up to five months, months beyond that.
 */
export function slotsOf(w: Window, firstDate?: string): Slot[] {
  const from = w.from ?? firstDate ?? w.to;
  const days = Math.round((parseIso(w.to).getTime() - parseIso(from).getTime()) / 86_400_000);
  const out: Slot[] = [];
  if (days <= 35) {
    for (let d = from; d < w.to; d = addDaysIso(d, 1)) {
      const t = parseIso(d);
      // narrow, a month of days keeps only each week's first number
      out.push({ key: d, label: String(t.getDate()), short: (t.getDate() - 1) % 7 === 0 ? String(t.getDate()) : "", long: t.toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric" }), from: d, to: addDaysIso(d, 1) });
    }
  } else if (days <= 155) {
    for (let d = from; d < w.to; d = addDaysIso(d, 7)) {
      const end = addDaysIso(d, 7) < w.to ? addDaysIso(d, 7) : w.to;
      const t = parseIso(d);
      out.push({ key: d, label: t.toLocaleDateString(LOCALE, { month: "short", day: "numeric" }), short: String(t.getDate()), long: `Week of ${t.toLocaleDateString(LOCALE, { month: "long", day: "numeric" })}`, from: d, to: end });
    }
  } else {
    const start = parseIso(from);
    for (let m = new Date(start.getFullYear(), start.getMonth(), 1); isoDate(m) < w.to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const a = isoDate(m), b = isoDate(new Date(m.getFullYear(), m.getMonth() + 1, 1));
      out.push({ key: a, label: monthTick(m, out.length === 0), short: m.toLocaleDateString(LOCALE, { month: "narrow" }), long: m.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }), from: a < from ? from : a, to: b < w.to ? b : w.to });
    }
  }
  return out;
}

/** The measure in each slot. */
export function seriesOf(lines: ExploreLine[], slots: Slot[], m: MeasureKey): number[] {
  return slots.map((s) => totals(lines.filter((l) => l.date >= s.from && l.date < s.to), m).value);
}

/** The comparison's slots: the same shape as the view's, shifted to start where the comparison starts. */
export function alignSlots(slots: Slot[], view: Window, other: Window): Slot[] {
  if (!view.from || !other.from) return [];
  const months = slots.length && slots[0].key.endsWith("-01") && slots.every((s) => s.key.endsWith("-01")) && slots.length > 1 && parseIso(slots[1].key).getDate() === 1;
  if (months) {
    const a = parseIso(view.from), b = parseIso(other.from);
    const shift = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    // each slot names its own month, so a tooltip reads "January 2025", not the whole year it sits in
    return slots.map((s) => ({ ...s, from: addMonths(s.from, shift), to: addMonths(s.to, shift), long: parseIso(addMonths(s.key, shift)).toLocaleDateString(LOCALE, { month: "long", year: "numeric" }) }));
  }
  const offset = Math.round((parseIso(other.from).getTime() - parseIso(view.from).getTime()) / 86_400_000);
  const otherYear = parseIso(other.from).getFullYear() !== parseIso(view.from).getFullYear();
  return slots.map((s) => {
    const from = addDaysIso(s.from, offset), t = parseIso(from);
    const day = t.toLocaleDateString(LOCALE, { month: "long", day: "numeric", year: otherYear ? "numeric" : undefined });
    const long = addDaysIso(s.from, 1) === s.to ? t.toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric", year: otherYear ? "numeric" : undefined }) : `Week of ${day}`;
    return { ...s, from, to: addDaysIso(s.to, offset), long };
  });
}

/** Running total of the measure for each day of a window, stopping before `until`. */
export function runningTotal(lines: ExploreLine[], w: Window, m: MeasureKey, until?: string): number[] {
  if (!w.from) return [];
  const per = new Map<string, number>();
  for (const l of lines) if (l.date >= w.from && l.date < w.to) per.set(l.date, (per.get(l.date) ?? 0) + (m === "count" ? 1 : measureOf(l, m)));
  const out: number[] = [];
  let total = 0;
  for (let d = w.from; d < w.to && (!until || d < until); d = addDaysIso(d, 1)) { total += per.get(d) ?? 0; out.push(total); }
  return out;
}

/** Days in a window. */
export const daysIn = (w: Window) => (w.from ? Math.round((parseIso(w.to).getTime() - parseIso(w.from).getTime()) / 86_400_000) : 0);

/** "Nov '25" on the first column and every January, "Dec" elsewhere, so a run of months always says which year. */
export function monthTick(d: Date, first = false): string {
  const short = d.toLocaleDateString(LOCALE, { month: "short" }).replace(".", "");
  return first || d.getMonth() === 0 ? `${short} '${String(d.getFullYear()).slice(2)}` : short;
}

/** A window as dates people read: "Nov 2025 – Oct 2026", "September 2026", or "Sep 6 – Oct 25". */
export function datesOf(w: Window): string {
  if (!w.from) return "All time";
  const a = parseIso(w.from), b = parseIso(addDaysIso(w.to, -1));
  const wholeMonths = a.getDate() === 1 && parseIso(w.to).getDate() === 1;
  if (wholeMonths) {
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return a.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
    return `${a.toLocaleDateString(LOCALE, { month: "short", year: "numeric" })} – ${b.toLocaleDateString(LOCALE, { month: "short", year: "numeric" })}`;
  }
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${a.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" })} – ${b.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** The month a line counts for. */
export const monthOf = (l: ExploreLine) => l.month ?? `${l.date.slice(0, 7)}-01`;

export type YearRow = {
  year: number; label: string; long: string;
  /** That month's total ("every October"), or the year's average month. */
  value: number;
  /** Finished months behind the value. */
  months: number;
  /** Only the month still running: shown, but kept out of the average. */
  partial: boolean;
  lines: ExploreLine[];
};

/**
 * One row per year. With a month of the year chosen, that month's total each year; otherwise each year's average
 * month. Only months the records wholly cover count, from the first whole month on record to the last finished one;
 * the month still running shows as "so far" and stays out of the average, and a month with records but nothing
 * spent counts as nothing spent.
 */
export function yearByYear(lines: ExploreLine[], m: MeasureKey, o: { from: string | null; to: string; earliest: string | null; today: string; month?: number }) {
  const first = o.earliest ? (o.earliest.endsWith("-01") ? o.earliest : addMonths(`${o.earliest.slice(0, 7)}-01`, 1)) : null;
  const fromMonth = o.from ? (o.from.endsWith("-01") ? o.from : addMonths(`${o.from.slice(0, 7)}-01`, 1)) : null;
  const start = [first, fromMonth].filter(Boolean).sort().at(-1) ?? lines.map(monthOf).sort()[0];
  const current = `${o.today.slice(0, 7)}-01`;
  if (!start) return { rows: [] as YearRow[], average: 0, months: 0 };
  const byMonth = new Map<string, ExploreLine[]>();
  for (const l of lines) { const k = monthOf(l); (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(l); }
  const years = new Map<number, { done: number[]; now: number | null; lines: ExploreLine[]; running: ExploreLine[] }>();
  for (let k = start; k <= current && k < o.to; k = addMonths(k, 1)) {
    if (o.month !== undefined && Number(k.slice(5, 7)) - 1 !== o.month) continue;
    const y = Number(k.slice(0, 4));
    const row = years.get(y) ?? years.set(y, { done: [], now: null, lines: [], running: [] }).get(y)!;
    const here = byMonth.get(k) ?? [];
    const v = totals(here, m).value;
    if (k === current) { row.now = v; row.running = here; } else { row.done.push(v); row.lines.push(...here); }
  }
  const name = (y: number) => o.month === undefined ? String(y) : parseIso(`${y}-${String(o.month + 1).padStart(2, "0")}-01`).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
  const longName = (y: number) => o.month === undefined ? String(y) : parseIso(`${y}-${String(o.month + 1).padStart(2, "0")}-01`).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  const rows: YearRow[] = [...years].map(([year, r]) => {
    const sum = r.done.reduce((a, b) => a + b, 0);
    return {
      // the transactions behind the number: the finished months, or the running one when it is all there is
      year, label: name(year), long: longName(year), lines: r.done.length ? r.lines : r.running, months: r.done.length,
      value: r.done.length ? sum / r.done.length : r.now ?? 0, partial: r.done.length === 0,
    };
  });
  const done = [...years.values()].flatMap((r) => r.done);
  return { rows, average: done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0, months: done.length };
}
