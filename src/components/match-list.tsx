import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TransactionList } from "@/components/transaction-list";
import { formatCents } from "@/lib/money";
import { getHousehold } from "@/lib/household";
import { getToday } from "@/lib/today";
import { parseSearch } from "@/lib/search";
import { findTransactions } from "@/lib/find-transactions";

const SHOWN = 200;

/**
 * The transactions behind a number: what a search finds, with a title saying what the number was. Opened from
 * Home as a peek (tap "Spent", a budget or a bill); "Open in Activity" carries the same search over.
 */
export async function MatchList({ q, title }: { q: string; title?: string }) {
  const [h, today] = await Promise.all([getHousehold(), getToday()]);
  const { slice, chips } = parseSearch(q, { today, buckets: h.buckets, accounts: h.accounts, members: h.members, userId: h.userId });
  const { rows, error } = await findTransactions(h, slice);
  const out = rows.reduce((s, t) => s + Math.min(t.amount_cents, 0), 0), into = rows.reduce((s, t) => s + Math.max(t.amount_cents, 0), 0);
  const lookup = { accounts: h.accounts, buckets: h.buckets, members: h.members, userId: h.userId };
  return (
    <div className="match-list">
      <header className="match-head">
        <h1 className="title">{title || chips.map((c) => c.label).join(" · ") || "Transactions"}</h1>
        <p className="caption">
          {rows.length} {rows.length === 1 ? "transaction" : "transactions"}
          {out < 0 && <> · <span className="nl-amt">{formatCents(-out, { sign: false })}</span> out</>}
          {into > 0 && <> · <span className="nl-amt in">{formatCents(into, { sign: false })}</span> in</>}
        </p>
      </header>
      {error ? <p className="msg msg-err" role="alert">Couldn’t load these. Try again in a moment.</p>
        : <TransactionList rows={rows.slice(0, SHOWN)} lookup={lookup} empty="Nothing here." />}
      <Link href={`/transactions?q=${encodeURIComponent(q)}`} className="nl-btn nl-btn-sm nl-btn-ghost match-more">
        {rows.length > SHOWN ? `See all ${rows.length} in Activity` : "Open in Activity"}<ArrowRight size={15} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  );
}
