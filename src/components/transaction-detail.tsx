import { CURRENCY, LOCALE } from "@/lib/format";
import { notFound } from "next/navigation";
import { BucketIcon } from "@/components/bucket-icon";
import { DeleteTransaction } from "@/components/delete-transaction";
import { LendingPanel } from "@/components/owed-actions";
import { formatOwed, groupOwed, owedAmount, type OwedEntry } from "@/lib/owed";
import { Amount } from "@/components/ui";
import { TransactionForm } from "@/components/transaction-form";
import { updateTransaction } from "@/lib/actions";
import { bucketMenu, bucketPath } from "@/lib/buckets";
import { QuickReview } from "@/components/quick-review";
import { getHousehold } from "@/lib/household";
import { tidyMerchant } from "@/lib/merchant";
import { TX_SELECT, needsLook, type TransactionRow } from "@/lib/types";

type OwedLink = OwedEntry & { settled_on: string | null; transaction_id: string | null; settled_transaction_id: string | null };

const SOURCE: Record<string, string> = { quick: "quick add", manual: "manual entry", receipt: "receipt", statement: "bank statement", transfer: "transfer" };

/** One transaction, ready to edit: the same whether it opens as a full page or as a peek over Activity. */
export async function TransactionDetail({ id }: { id: string }) {
  const h = await getHousehold();
  const [{ data }, { data: owed }] = await Promise.all([
    h.supabase.from("transactions").select(TX_SELECT).eq("id", id).maybeSingle(),
    h.supabase.from("owed").select("person, amount_cents, reason, date, due_date, settled_on, transaction_id, settled_transaction_id, attrs").order("date"),
  ]);
  if (!data) notFound();
  // a transaction that needs a look leads with a quick check: the buckets this place has gone in before come first
  const reviewing = needsLook(data as TransactionRow) && (data as TransactionRow).splits.length <= 1;
  const { data: before } = reviewing
    ? await h.supabase.from("lines").select("bucket_id").eq("merchant", (data as TransactionRow).merchant).neq("transaction_id", id).not("bucket_id", "is", null).limit(200)
    : { data: [] };
  const seen = new Map<string, number>();
  for (const l of (before ?? []) as { bucket_id: string }[]) seen.set(l.bucket_id, (seen.get(l.bucket_id) ?? 0) + 1);
  const choice = (b: (typeof h.buckets)[number]) => ({ id: b.id, name: b.name, icon: b.icon, color: b.color });
  const usual = [...seen].sort((x, y) => y[1] - x[1]).map(([bid]) => h.buckets.find((b) => b.id === bid && !b.archived)).filter((b) => !!b).map(choice);
  // IOUs this transaction made or paid off, and who still owes us (for "paid back by")
  const iou = (owed ?? []) as OwedLink[];
  const linked = iou.filter((o) => o.transaction_id === id || o.settled_transaction_id === id);
  const open = groupOwed(iou.filter((o) => !o.settled_on));
  const people = [...new Set(iou.map((o) => o.person))];
  const owesUs = open.filter((r) => owedAmount(r) > 0 && (r.currency ?? CURRENCY) === CURRENCY).map((r) => r.person);
  const t = data as TransactionRow;
  const addedBy = h.members.find((m) => m.user_id === t.created_by)?.display_name;
  const accounts = h.accounts.filter((a) => !a.archived || a.id === t.account_id);
  const account = h.accounts.find((a) => a.id === t.account_id);
  const bucket = h.buckets.find((b) => b.id === t.splits[0]?.bucket_id);
  const tidy = tidyMerchant(t.merchant);
  // offered on spending and on money in while someone owes us; moves between our own accounts are never a loan
  const lendable = linked.length > 0 || (!["transfer", "saving", "goal"].includes(bucket?.kind ?? "") && (t.amount_cents < 0 || owesUs.length > 0));
  const date = new Date(`${t.date}T12:00`).toLocaleDateString(LOCALE, { weekday: "short", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="tx-detail">
      <header className="tx-hero">
        <BucketIcon icon={bucket?.icon} color={bucket?.color} seed={bucket?.id ?? t.merchant} />
        <div className="tx-hero-text">
          <h1 className="title">{tidy}</h1>
          <p className="caption">{date}{account ? ` · ${account.name}` : ""}</p>
        </div>
        <span className="tx-hero-amt"><Amount cents={t.amount_cents} /></span>
      </header>
      {reviewing && (
        <QuickReview id={t.id} current={bucket ? choice(bucket) : null} usual={usual} options={bucketMenu(h.buckets)} />
      )}
      <p className="caption tx-meta">
        {addedBy ? `Added by ${addedBy}` : "Added"} from {SOURCE[t.source] ?? t.source}
        {tidy !== t.merchant && <> · on the statement as “{t.merchant}”</>}
        {t.needs_review && " · marked to check"}
      </p>
      {t.splits.length > 1 && (
        <section className="section">
          <h2 className="heading">Split</h2>
          <div className="nl-card">
            {t.splits.map((sp, i) => {
              const b = h.buckets.find((x) => x.id === sp.bucket_id);
              return (
                <div key={i} className="nl-budget">
                  <div className="nl-budget-top">
                    <span className="nl-budget-name"><BucketIcon icon={b?.icon} color={b?.color} seed={b?.id} small />{b ? bucketPath(h.buckets, b.id) : "No bucket"}</span>
                    <Amount cents={sp.amount_cents} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <TransactionForm
        action={updateTransaction.bind(null, t.id)}
        accounts={accounts}
        buckets={h.buckets}
        submitLabel="Save changes"
        defaults={{
          merchant: t.merchant, amountCents: t.amount_cents, date: t.date,
          accountId: t.account_id, bucketId: t.splits[0]?.bucket_id, note: t.note, splitCount: t.splits.length,
        }}
      >
        <DeleteTransaction id={t.id} />
      </TransactionForm>
      {lendable && <section className="section tx-lend">
        <h2 className="heading">Lending</h2>
        {linked.length ? (
          <ul className="owed nl-card lend-links">
            {linked.map((o, i) => (
              <li key={i}>
                <span className="owed-name">{o.settled_transaction_id === id ? `${o.person} paid you back` : o.amount_cents > 0 ? `${o.person} owes you for this` : `${o.person} paid you back part`}
                  <span className="caption">{o.reason && o.reason !== t.merchant ? `${o.reason} · ` : ""}{o.settled_on ? (o.settled_transaction_id === id ? "settled" : `settled ${o.settled_on}`) : o.due_date ? `due ${o.due_date}` : "still open"}</span>
                </span>
                <span className="nl-amt">{formatOwed(Math.abs(o.amount_cents))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <LendingPanel transactionId={t.id} cents={t.amount_cents}
            people={t.amount_cents < 0 ? people : owesUs} />
        )}
      </section>}
    </div>
  );
}
