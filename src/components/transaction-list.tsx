import Link from "next/link";
import { tidyMerchant } from "@/lib/merchant";
import { needsLook, type Account, type Bucket, type Member, type TransactionRow } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { BucketIcon } from "./bucket-icon";
import { SwipeRow } from "./swipe-row";
import { Amount, StatusBadge } from "./ui";

type Lookup = { accounts: Account[]; buckets: Bucket[]; members: Member[]; userId: string };

export function TransactionList({ rows, lookup, empty, flush }: { rows: TransactionRow[]; lookup: Lookup; empty: string; flush?: boolean }) {
  if (rows.length === 0) return <div className={flush ? "empty" : "nl-card empty"}>{empty}</div>;
  return (
    <div className={flush ? "tx-flush" : "nl-card"}>
      {/* Home's Recent card is a glance: it flags only what needs a look, not what already matched */}
      {rows.map((t) => <Row key={t.id} t={t} lookup={lookup} matched={!flush} />)}
    </div>
  );
}

export function Row({ t, lookup, matched = true }: { t: TransactionRow; lookup: Lookup; matched?: boolean }) {
  const account = lookup.accounts.find((a) => a.id === t.account_id);
  const cats = t.splits.map((s) => lookup.buckets.find((b) => b.id === s.bucket_id));
  const first = cats[0];
  const review = needsLook(t);
  const byOther = t.created_by && t.created_by !== lookup.userId
    ? lookup.members.find((m) => m.user_id === t.created_by)?.display_name
    : null;

  const meta = [
    formatDate(t.date),
    account?.name,
    cats.length > 1 ? `${cats.length} buckets` : first?.name ?? "No bucket",
    byOther ? `by ${byOther}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SwipeRow id={t.id} review={review}>
    <Link href={`/transactions/${t.id}`} className="nl-tx nl-tx-has-icon" scroll={false}>
      <span className="nl-tx-icon"><BucketIcon icon={first?.icon} color={first?.color} seed={first?.id} /></span>
      <span className="nl-tx-merchant" title={t.merchant}>{tidyMerchant(t.merchant)}</span>
      <span className="nl-tx-right">
        <Amount cents={t.amount_cents} />
        {review ? <StatusBadge status="review" /> : matched && t.verified ? <StatusBadge status="verified" /> : null}
      </span>
      <span className="nl-tx-meta">
        {meta}
        {t.orig_currency && t.orig_amount != null ? ` · ${t.orig_amount} ${t.orig_currency}` : ""}
      </span>
    </Link>
    </SwipeRow>
  );
}
