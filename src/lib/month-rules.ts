// Payments that belong to a different month than the one they landed in: rent sent in the last days of a month,
// a stipend that arrives before the month it pays for. Saved as active `recurring` rows whose attrs say
// {"counts_for": "next_month", "from_day"?: 25}; the merchant matches as text, ignoring case and spaces.

export type MonthRule = { merchant: string; account_id: string | null; attrs: { from_day?: number } | null };

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, "");

function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Moves each matching line to the month it pays for, and says in words (bucket names only, never the merchant)
 * what was moved, so whoever reads the numbers knows rent and income are already lined up with their months.
 */
export function applyMonthRules<L extends { date: string; month: string; merchant: string; account_id: string; bucket: string; amount_cents: number }>(
  lines: L[], rules: MonthRule[],
): { lines: L[]; notes: string[] } {
  const live = rules.map((r) => ({ ...r, merchant: squash(r.merchant), from: Number(r.attrs?.from_day) || 1, buckets: new Map<string, number>() }))
    .filter((r) => r.merchant);
  const out = lines.map((line) => {
    const rule = live.find((r) => (!r.account_id || r.account_id === line.account_id) && squash(line.merchant).includes(r.merchant));
    if (!rule || Number(line.date.slice(8, 10)) < rule.from) return line;
    rule.buckets.set(line.bucket, (rule.buckets.get(line.bucket) ?? 0) + Math.abs(line.amount_cents));
    return { ...line, month: nextMonth(line.month) };
  });
  // named after the bucket holding most of the money moved (a transfer's small fee doesn't name it)
  const notes = live.filter((r) => r.buckets.size).map((r) => {
    const bucket = [...r.buckets].sort((a, b) => b[1] - a[1])[0][0];
    return r.from > 1
      ? `${bucket}: a payment sent in the last days of a month pays for the next month, so it is counted in that next month; one sent in the first days of a month counts for that month.`
      : `${bucket}: this regular payment arrives at the end of the month before the one it pays for, so it is counted in the month it pays for.`;
  });
  return { lines: out, notes };
}

/**
 * The lines every chart and card counts: each one a month rule moves is dated the 1st of the month it pays for, so
 * a stretch of dates, a month and a year all agree on it. `paid_on` keeps the day it really landed, to show.
 * Balances never use these: money that left on the 29th left on the 29th.
 */
export function countedLines<L extends Parameters<typeof applyMonthRules>[0][number]>(lines: L[], rules: MonthRule[]): (L & { paid_on?: string })[] {
  if (!rules.length) return lines;
  return applyMonthRules(lines, rules).lines.map((l, i) => (l.month === lines[i].month ? l : { ...l, date: l.month, paid_on: lines[i].date }));
}
