"use client";

import { useActionState, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, CreditCard, NotebookPen, Sparkles, Tag } from "lucide-react";
import { Menu } from "./menu";
import { usePeek } from "./peek";
import { CategoryIcon } from "./icons";
import { bucketOptions } from "./transaction-form";
import { addTransaction } from "@/lib/actions";
import { isoDate } from "@/lib/dates";
import { formatCents, parseAmount } from "@/lib/money";
import { tidyMerchant } from "@/lib/merchant";
import { guessBucket, parseQuickAdd } from "@/lib/quick-add";
import type { Account, Bucket, Rule } from "@/lib/types";
import { DateField } from "./date-picker";

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };

/**
 * A new transaction as one small page: the name and the amount up top, then its details as quiet rows
 * (date, account, bucket, note). The name box also takes shorthand: "14.50 tims yesterday" offers to
 * fill everything in at once. The bucket follows the merchant's rule until you pick one yourself.
 */
export function AddTransaction({ accounts, buckets, rules }: { accounts: Account[]; buckets: Bucket[]; rules: Rule[] }) {
  const id = useId();
  const peek = usePeek();
  const title = useRef<HTMLInputElement>(null);
  const [again, setAgain] = useState(false); // the last save was "Save and add another"

  const [direction, setDirection] = useState<"out" | "in">("out");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [picked, setPicked] = useState<string | null>(null); // a bucket chosen by hand
  const [note, setNote] = useState("");
  const [learn, setLearn] = useState(true);
  const [quick, setQuick] = useState(false); // filled from shorthand

  const guessed = useMemo(() => (merchant.trim() ? guessBucket(merchant, buckets, rules) : null), [merchant, buckets, rules]);
  const bucketId = picked ?? guessed ?? "";
  const bucket = buckets.find((b) => b.id === bucketId);
  const options = useMemo(() => bucketOptions(buckets), [buckets]);

  // shorthand in the name box: only offered when it holds an amount and the amount box is still empty
  const shorthand = useMemo(() => {
    if (amount || !/\d/.test(merchant)) return null;
    return parseQuickAdd(merchant, { today: new Date(), accounts, buckets, rules });
  }, [merchant, amount, accounts, buckets, rules]);
  const fill = () => {
    if (!shorthand) return;
    setQuick(true);
    setMerchant(shorthand.merchant);
    setAmount((Math.abs(shorthand.amountCents) / 100).toFixed(2));
    setDirection(shorthand.amountCents > 0 ? "in" : "out");
    setDate(shorthand.date);
    if (shorthand.accountId) setAccountId(shorthand.accountId);
    if (shorthand.bucketId) setPicked(shorthand.bucketId);
  };

  const cents = parseAmount(amount);
  const ready = merchant.trim() !== "" && cents !== null && cents > 0 && !!accountId && !!date;

  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addTransaction>>, form: FormData) => {
    const result = await addTransaction(prev, form);
    const stay = form.get("again") === "1"; // the button that sent it says whether to stay
    setAgain(stay);
    if (result?.ok) {
      if (peek && !stay) peek.close();
      else {
        // stay for the next one: clear what's specific to this purchase, keep the account and date
        setMerchant(""); setAmount(""); setNote(""); setPicked(null); setDirection("out"); setQuick(false);
        title.current?.focus({ preventScroll: true });
      }
    }
    return result;
  }, null);

  const dateLabel = date === isoDate(new Date()) ? "Today" : date === daysAgo(1) ? "Yesterday" : null;

  return (
    <form action={formAction} className="composer" data-direction={direction}
      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) { e.preventDefault(); e.currentTarget.requestSubmit(); } }}>
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="bucket_id" value={bucketId} />
      <input type="hidden" name="date" value={date} />
      {quick && <input type="hidden" name="source" value="quick" />}

      <div className="nl-seg composer-dir" role="radiogroup" aria-label="Money in or out">
        {(["out", "in"] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={direction === value} onClick={() => setDirection(value)}>
            {value === "out" ? "Money out" : "Money in"}
          </button>
        ))}
      </div>

      <div className="composer-hero">
        <CategoryIcon icon={bucket?.icon} color={bucket?.color} seed={bucket?.id ?? (merchant || "new")} />
        <input ref={title} className="composer-title" name="merchant" value={merchant} required autoFocus data-autofocus autoComplete="off"
          aria-label="Merchant or description" placeholder={direction === "out" ? "Where did it go?" : "Where did it come from?"}
          onChange={(e) => setMerchant(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && shorthand) { e.preventDefault(); fill(); } }} />
      </div>

      {shorthand ? (
        <button type="button" className="composer-suggest" onClick={fill}>
          <Sparkles size={15} strokeWidth={1.75} aria-hidden />
          <span>Fill in <b>{tidyMerchant(shorthand.merchant)}</b> · {formatCents(shorthand.amountCents)} ·{" "}
            {shorthand.date === isoDate(new Date()) ? "Today" : shorthand.date === daysAgo(1) ? "Yesterday" : shorthand.date}
            {shorthand.bucketId ? ` · ${buckets.find((b) => b.id === shorthand.bucketId)?.name}` : ""}</span>
          <kbd>Enter</kbd>
        </button>
      ) : (
        <label className="composer-amount">
          <span className="composer-sign" aria-hidden>{direction === "out" ? "−$" : "+$"}</span>
          <input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" required autoComplete="off" aria-label="Amount" />
        </label>
      )}

      <div className="props" role="group" aria-label="Details">
        <div className="prop">
          <span className="prop-label" id={`${id}-date`}><CalendarDays size={16} strokeWidth={1.75} aria-hidden />Date</span>
          <div className="prop-value prop-date">
            <DateField variant="prop" value={date} max={isoDate(new Date())} onChange={setDate} labelledBy={`${id}-date`} />
            {dateLabel !== "Today" && <button type="button" className="prop-chip" onClick={() => setDate(isoDate(new Date()))}>Today</button>}
            {dateLabel !== "Yesterday" && <button type="button" className="prop-chip" onClick={() => setDate(daysAgo(1))}>Yesterday</button>}
          </div>
        </div>
        <div className="prop">
          <span className="prop-label" id={`${id}-account`}><CreditCard size={16} strokeWidth={1.75} aria-hidden />Account</span>
          <div className="prop-value">
            <Menu compact labelledBy={`${id}-account`} value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.institution ?? undefined }))} />
          </div>
        </div>
        <div className="prop">
          <span className="prop-label" id={`${id}-bucket`}><Tag size={16} strokeWidth={1.75} aria-hidden />Bucket</span>
          <div className="prop-value">
            <Menu compact labelledBy={`${id}-bucket`} value={bucketId} onChange={setPicked} options={options} placeholder="No bucket yet" />
            {!picked && guessed && <span className="prop-note">from this merchant’s usual bucket</span>}
          </div>
        </div>
        <div className="prop">
          <label className="prop-label" htmlFor={`${id}-note`}><NotebookPen size={16} strokeWidth={1.75} aria-hidden />Note</label>
          <div className="prop-value">
            <input id={`${id}-note`} className="prop-input" name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" autoComplete="off" />
          </div>
        </div>
      </div>

      {picked && merchant.trim() && picked !== guessed && (
        <label className="check composer-learn">
          <input type="checkbox" name="learn" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
          Always put {tidyMerchant(merchant.trim())} in {bucket?.name ?? "this bucket"}
        </label>
      )}

      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      {state?.ok && (!peek || again) && <p className="msg msg-ok" role="status">{state.ok}</p>}

      <div className="composer-foot">
        <span className="composer-tip">Tip: type <b>14.50 tims yesterday</b> in the name</span>
        <button className="nl-btn nl-btn-md nl-btn-secondary" disabled={pending || !ready} name="again" value="1">Save and add another</button>
        <button className="nl-btn nl-btn-md nl-btn-primary" disabled={pending || !ready} title="Save (⌘ Enter)">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
