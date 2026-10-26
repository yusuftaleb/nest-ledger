import { readStored, type AiRead } from "./ai-insights";
import type { Household } from "./household";
import type { MonthRule } from "./month-rules";
import { groupOwed, type OwedEntry } from "./owed";
import { applyRecurringExclusions, type RecurringExclusion } from "./recurring-exclusions";
import { TX_SELECT, type Account, type Budget, type Bucket, type Line, type Member, type OwedRow, type TransactionRow, type Widget } from "./types";

// Everything the dashboard reads, behind one interface: the real household reads Supabase,
// the dev-only /demo page reads generated data (src/lib/demo.ts).

export type Balance = { account_id: string; date: string; balance_cents: number };
export type ViewResult = { rows: Record<string, unknown>[]; error?: string };

export type DashboardSource = {
  userId: string;
  /** The first transaction's date, where period pickers start. */
  earliest: string | null;
  me: Member;
  members: Member[];
  accounts: Account[];
  buckets: Bucket[];
  widgets(page: string): Promise<Widget[]>;
  /** Every line with start <= date < end; start null = from the beginning. */
  lines(start: string | null, end: string): Promise<Line[]>;
  /** All lines of these buckets, ever (goal progress). */
  linesOf(bucketIds: string[]): Promise<Pick<Line, "bucket_id" | "amount_cents">[]>;
  budgets(): Promise<Budget[]>;
  /** Newest first; with a range, only transactions dated inside it. */
  transactions(limit: number, range?: { start: string | null; end: string }): Promise<TransactionRow[]>;
  balances(): Promise<Balance[]>;
  /** Open IOUs per person. */
  owed(): Promise<OwedRow[]>;
  view(name: string, limit: number): Promise<ViewResult>;
  /** Payments that count for the next month (rent sent early, income paid ahead): see src/lib/month-rules.ts. */
  monthRules?(): Promise<MonthRule[]>;
  /** The latest insights and patterns Codex wrote (scripts/ai-insights.mts), or null when none is under two days old. */
  ai?(): Promise<AiRead | null>;
  /** Made-up data: nothing on the page may change the real household. */
  demo?: boolean;
};

/** Rows per request. Matches the project's API max_rows (Supabase → Settings → API), raised from 1,000 to 20,000. */
const PAGE = 20_000;

export function supabaseSource(h: Household): DashboardSource {
  const db = h.supabase;
  let exclusions: Promise<RecurringExclusion[]> | undefined;
  let aiRead: Promise<AiRead | null> | undefined;
  const recurringExclusions = () => exclusions ??= (async () => {
    const { data, error } = await db.from("recurring").select("merchant, account_id")
      .eq("household_id", h.householdId).eq("active", false).eq("attrs->>exclude_from_detection", "true");
    if (error) throw new Error(`Could not load bill exclusions: ${error.message}`);
    return (data ?? []) as RecurringExclusion[];
  })();
  return {
    userId: h.userId, earliest: h.earliest, me: h.me, members: h.members, accounts: h.accounts, buckets: h.buckets,
    async widgets(page) {
      const { data } = await db.from("widgets").select("id, page, position, type, title, spec")
        .eq("page", page).eq("enabled", true).order("position");
      return (data ?? []) as Widget[];
    },
    async lines(start, end) {
      // read alongside the lines, not before them: one round trip instead of two
      const excludedMerchants = recurringExclusions();
      excludedMerchants.catch(() => {}); // if a page of lines fails first, that error is the one reported
      // The API returns at most PAGE rows per request (max_rows is raised to match), so a year of history is one round trip.
      const out: Line[] = [];
      for (let from = 0; from < 200_000; from += PAGE) {
        let q = db.from("lines").select("*").lt("date", end).order("date").order("split_id").range(from, from + PAGE - 1);
        if (start) q = q.gte("date", start);
        const { data, error } = await q;
        if (error) throw new Error(`Could not load transactions: ${error.message}`);
        out.push(...(data as Line[]));
        if (data.length < PAGE) break;
      }
      return applyRecurringExclusions(out, await excludedMerchants);
    },
    async linesOf(ids) {
      const out: Pick<Line, "bucket_id" | "amount_cents">[] = [];
      for (let from = 0; ids.length && from < 200_000; from += PAGE) {
        const { data, error } = await db.from("lines").select("bucket_id, amount_cents").in("bucket_id", ids)
          .order("split_id").range(from, from + PAGE - 1);
        if (error) throw new Error(`Could not load goal progress: ${error.message}`);
        out.push(...(data as typeof out));
        if (data.length < PAGE) break;
      }
      return out;
    },
    async budgets() {
      const { data } = await db.from("budgets").select("id, bucket_id, amount_cents, period, starts, ends, attrs");
      return (data ?? []) as Budget[];
    },
    async transactions(limit, range) {
      let q = db.from("transactions").select(TX_SELECT)
        .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      if (range) {
        q = q.lt("date", range.end);
        if (range.start) q = q.gte("date", range.start);
      }
      const { data } = await q;
      return (data ?? []) as TransactionRow[];
    },
    async balances() {
      const { data } = await db.from("balances").select("account_id, date, balance_cents").order("date").limit(5000);
      return (data ?? []) as Balance[];
    },
    async owed() {
      const entries: OwedEntry[] = [];
      for (let from = 0; from < 200_000; from += PAGE) {
        const { data, error } = await db.from("owed").select("id, person, amount_cents, reason, date, due_date, attrs")
          .is("settled_on", null).order("id").range(from, from + PAGE - 1);
        if (error) throw new Error(`Could not load money owed: ${error.message}`);
        entries.push(...(data as OwedEntry[]));
        if (data.length < PAGE) break;
      }
      return groupOwed(entries);
    },
    async view(name, limit) {
      const { data, error } = await db.from(name).select("*").limit(limit);
      return { rows: (data ?? []) as Record<string, unknown>[], error: error?.message };
    },
    async monthRules() {
      // optional: without them, every payment counts in the month it landed
      const { data, error } = await db.from("recurring").select("merchant, account_id, attrs")
        .eq("household_id", h.householdId).eq("active", true).eq("attrs->>counts_for", "next_month");
      return error ? [] : (data ?? []) as MonthRule[];
    },
    ai() {
      // optional: a missing, failed or stale read just leaves the Home card out
      return aiRead ??= (async () => {
        const { data, error } = await db.from("ai_insights").select("generated_at, items").eq("household_id", h.householdId)
          .order("generated_at", { ascending: false }).limit(1).maybeSingle();
        return error ? null : readStored(data, new Date(), 2);
      })().catch(() => null);
    },
  };
}

/**
 * The same source, but line reads inside [from, to) are answered from lines already loaded, with no
 * database round trip. The Analysis page loads once and its cards reuse that read.
 */
export function withLoadedLines(source: DashboardSource, loaded: Line[], from: string | null, to: string): DashboardSource {
  return {
    ...source,
    async lines(start, end) {
      const covered = (from === null || (start !== null && start >= from)) && end <= to;
      if (!covered) return source.lines(start, end);
      return loaded.filter((l) => (!start || l.date >= start) && l.date < end);
    },
  };
}
