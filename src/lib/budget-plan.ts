import { LOCALE } from "./format.ts";
import { getHousehold } from "./household";
import { getToday } from "./today";
import { isoDate } from "./dates";
import { bucketsUnder, measureOf } from "./dashboard";

export type BudgetPlan = {
  /** The top-level spend buckets a budget can go on, in the household's order. */
  buckets: Awaited<ReturnType<typeof getHousehold>>["buckets"];
  /** Each bucket's budget for this month, if it has one. */
  current: Record<string, { amount_cents: number; period: string; rollover: boolean }>;
  /** Each bucket's average spending over the last three full months. */
  usual: Record<string, number>;
  /** "Aug – Oct", the months behind `usual`. */
  usualLabel: string;
  /** The month a new budget starts, as "November 2026". */
  startsLabel: string;
};

/** What the budget form needs: the buckets, their budgets now, and what each usually spends. */
export async function budgetPlan(): Promise<BudgetPlan> {
  const [h, today] = await Promise.all([getHousehold(), getToday()]);
  const thisMonth = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const from = isoDate(new Date(today.getFullYear(), today.getMonth() - 3, 1));
  const [budgets, lines] = await Promise.all([
    h.supabase.from("budgets").select("bucket_id, amount_cents, period, starts, ends, attrs").lte("starts", thisMonth).or(`ends.is.null,ends.gte.${thisMonth}`),
    h.supabase.from("lines").select("bucket_id, kind, amount_cents").gte("date", from).lt("date", thisMonth).limit(20000),
  ]);

  const buckets = h.buckets.filter((b) => !b.archived && !b.parent_id && (b.kind ?? "spend") === "spend");
  const current: BudgetPlan["current"] = {};
  for (const b of [...(budgets.data ?? [])].sort((x, y) => x.starts.localeCompare(y.starts))) {
    current[b.bucket_id] = { amount_cents: b.amount_cents, period: b.period, rollover: (b.attrs as { rollover?: unknown } | null)?.rollover === true };
  }
  const rows = (lines.data ?? []) as { bucket_id: string | null; kind: string; amount_cents: number }[];
  const usual: BudgetPlan["usual"] = {};
  for (const b of buckets) {
    const ids = bucketsUnder([b.name], h.buckets);
    const spent = rows.reduce((s, l) => s + (l.bucket_id && ids.has(l.bucket_id) ? measureOf(l, "spend") : 0), 0);
    if (spent > 0) usual[b.id] = Math.round(spent / 3);
  }
  const month = (offset: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(today.getFullYear(), today.getMonth() + offset, 1).toLocaleDateString(LOCALE, opts);
  return {
    buckets, current, usual,
    usualLabel: `${month(-3, { month: "short" })} – ${month(-1, { month: "short" })}`,
    startsLabel: month(0, { month: "long", year: "numeric" }),
  };
}
