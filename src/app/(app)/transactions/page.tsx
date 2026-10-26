import { LOCALE } from "@/lib/format";
import Link from "next/link";
import { BulkActivity } from "@/components/bulk-activity";
import { Row } from "@/components/transaction-list";
import { SearchBox } from "@/components/search-box";
import { TransactionList } from "@/components/transaction-list";
import { Amount } from "@/components/ui";
import { getHousehold } from "@/lib/household";
import { getToday } from "@/lib/today";
import { parseSearch } from "@/lib/search";
import { findTransactions } from "@/lib/find-transactions";
import { isoDate } from "@/lib/money";
import { bucketMenu } from "@/lib/buckets";
import type { TransactionRow } from "@/lib/types";

export const metadata = { title: "Activity" };

const SORTS = { newest: "Newest first", oldest: "Oldest first", largest: "Largest first", smallest: "Smallest first" } as const;
type Sort = keyof typeof SORTS;
const PAGE = 100;

/**
 * Every transaction, newest first, with smart search. The date range, accounts, people and words narrow the
 * database query; buckets, kinds, amounts and flags are checked here, so the totals cover every match,
 * not just the rows on screen.
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const params = (await searchParams) as { q?: string; view?: string; sort?: string; limit?: string };
  const q = params.q ?? "";
  const sort: Sort = params.sort && params.sort in SORTS ? (params.sort as Sort) : "newest";
  const limit = Math.min(Math.max(Number(params.limit) || PAGE, PAGE), 5000);
  const h = await getHousehold();
  const savedSearches = h.supabase.from("saved_views").select("id, name, query").eq("page", "activity").order("name");
  const today = await getToday();
  const { slice } = parseSearch(q, { today, buckets: h.buckets, accounts: h.accounts, members: h.members, userId: h.userId });
  if (params.view === "review" && !slice.flags.includes("review")) slice.flags.push("review");

  const [{ rows: matched, error }, { data: saved }] = await Promise.all([findTransactions(h, slice), savedSearches]);

  const sorted = sort === "newest" ? matched
    : sort === "oldest" ? [...matched].reverse()
    : [...matched].sort((a, b) => (sort === "largest" ? Math.abs(b.amount_cents) - Math.abs(a.amount_cents) : Math.abs(a.amount_cents) - Math.abs(b.amount_cents)));
  // a search shows every match; the plain list pages, but never cuts a month in half
  let end = q ? Math.max(limit, 2000) : limit;
  if (sort === "newest" || sort === "oldest") while (end < sorted.length && sorted[end].date.slice(0, 7) === sorted[end - 1]?.date.slice(0, 7)) end++;
  const shown = sorted.slice(0, end);

  // totals over every match, counted the way Home and Analysis count them: a refund comes off money out rather
  // than adding to money in, and moves between our own accounts are neither (each move is counted once, as it leaves)
  const kindOf = (id: string | null) => h.buckets.find((b) => b.id === id)?.kind;
  const tally = (t: TransactionRow, m: { out: number; in: number; moved?: number; lent?: number }) => {
    for (const s of t.splits.length ? t.splits : [{ amount_cents: t.amount_cents, bucket_id: null }]) {
      const k = kindOf(s.bucket_id);
      if (k === "transfer" || k === "goal" || k === "saving") { if (s.amount_cents < 0 && m.moved !== undefined) m.moved -= s.amount_cents; }
      else if (k === "lent") { if (m.lent !== undefined) m.lent -= s.amount_cents; }
      else if (k === "spend") m.out -= s.amount_cents;
      else if (k === "income") m.in += s.amount_cents;
      else if (s.amount_cents > 0) m.in += s.amount_cents; else m.out -= s.amount_cents;
    }
  };
  const totals = { out: 0, in: 0, moved: 0, lent: 0 };
  for (const t of matched) tally(t, totals);
  const { out: moneyOut, in: moneyIn, moved, lent } = totals;

  // date-sorted lists are grouped by month, each foldable, with its own count and totals (over every match that month)
  const groups: { key: string; label: string; rows: TransactionRow[]; count: number; out: number; in: number }[] = [];
  if (sort === "newest" || sort === "oldest") {
    const monthTotals = new Map<string, { count: number; out: number; in: number }>();
    for (const t of matched) {
      const key = t.date.slice(0, 7);
      const m = monthTotals.get(key) ?? { count: 0, out: 0, in: 0 };
      m.count++;
      tally(t, m);
      monthTotals.set(key, m);
    }
    for (const t of shown) {
      const key = t.date.slice(0, 7);
      if (groups.at(-1)?.key !== key) groups.push({ key, label: new Date(`${key}-01T12:00`).toLocaleDateString(LOCALE, { month: "long", year: "numeric" }), rows: [], ...monthTotals.get(key)! });
      groups.at(-1)!.rows.push(t);
    }
  }
  // what the client list needs from the household (plain data), and the bucket menu for bulk changes
  const lookup = { accounts: h.accounts, buckets: h.buckets, members: h.members, userId: h.userId };
  const bucketOptions = bucketMenu(h.buckets);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, sort: sort === "newest" ? undefined : sort, view: params.view, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/transactions${p.toString() ? `?${p}` : ""}`;
  };
  const ctx = {
    buckets: h.buckets.filter((b) => !b.archived).map(({ id, name, parent_id, kind, icon, color }) => ({ id, name, parent_id, kind, icon, color })),
    accounts: h.accounts.map(({ id, name, institution }) => ({ id, name, institution })),
    members: h.members.map(({ user_id, display_name }) => ({ user_id, display_name })),
    userId: h.userId,
  };

  return (
    <>
      <header className="page-head"><h1 className="title">Activity</h1></header>
      <SearchBox ctx={ctx} today={isoDate(today)} earliest={h.earliest} saved={saved ?? []}
        sort={{ value: sort, options: (Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: SORTS[k] })) }} />
      {error ? (
        <p className="msg msg-err" role="alert">Couldn’t load transactions. Try again in a moment.</p>
      ) : (
        <>
          <dl className="result-sum" aria-live="polite">
            <div><dt>Found</dt><dd className="nl-amt">{matched.length.toLocaleString(LOCALE)}</dd></div>
            <div><dt>Money out</dt><dd><Amount cents={-moneyOut} plain tone="neutral" /></dd></div>
            <div><dt>Money in</dt><dd><Amount cents={moneyIn} plain /></dd></div>
            {moved > 0 && <div><dt>Between your accounts</dt><dd><Amount cents={moved} plain tone="neutral" /></dd></div>}
            {lent !== 0 && <div><dt>{lent > 0 ? "Lent out" : "Paid back to you"}</dt><dd><Amount cents={Math.abs(lent)} plain tone="neutral" /></dd></div>}
          </dl>
          {groups.length ? (
            <BulkActivity bucketOptions={bucketOptions} groups={groups.map((g) => ({
              // months always open unfolded; folding one lasts only while you're here
              ...g, folded: false,
              rows: g.rows.map((t) => ({ id: t.id, merchant: t.merchant, node: <Row t={t} lookup={lookup} /> })),
            }))} />
          ) : (
            <TransactionList rows={shown} lookup={h}
              empty={q ? "Nothing matches. Try fewer words, or tap × on a chip." : "No transactions yet."} />
          )}
          {matched.length > shown.length && (
            <Link href={href({ limit: String(end + 200) })} className="nl-btn nl-btn-md nl-btn-secondary btn-block" scroll={false} replace>
              Show more ({(matched.length - shown.length).toLocaleString(LOCALE)} left)
            </Link>
          )}
        </>
      )}
    </>
  );
}
