"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Menu, type Option } from "./menu";
import { usePeek } from "./peek";
import type { FormState } from "@/lib/actions";
import { bucketMenu } from "@/lib/buckets";
import type { Account, Bucket } from "@/lib/types";
import { isoDate } from "@/lib/dates";
import { DateField } from "./date-picker";

type Defaults = {
  merchant?: string; amountCents?: number; date?: string; accountId?: string; bucketId?: string | null; note?: string | null; splitCount?: number;
};

/** Every bucket for a menu: grouped by kind, with the ones inside a parent tucked under it. */
export function bucketOptions(buckets: Bucket[], keep?: string | null): Option[] {
  return [{ value: "", label: "No bucket yet" }, ...bucketMenu(buckets, keep)];
}

/** Add or edit one transaction: the app's own menus for account and bucket, the same labels and placeholders as every form. */
export function TransactionForm({
  action, accounts, buckets, defaults = {}, submitLabel, children,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  accounts: Account[];
  buckets: Bucket[];
  defaults?: Defaults;
  submitLabel: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, null);
  // saved in a peek: close it, back to the list that now shows the change
  const peek = usePeek();
  useEffect(() => { if (state?.ok && peek) peek.close(); }, [state, peek]);
  const [direction, setDirection] = useState(defaults.amountCents && defaults.amountCents > 0 ? "in" : "out");
  const split = (defaults.splitCount ?? 0) > 1;
  const initialBucket = split ? "keep" : defaults.bucketId ?? "";
  const [bucketId, setBucketId] = useState(initialBucket);
  const [accountId, setAccountId] = useState(defaults.accountId ?? accounts[0]?.id ?? "");
  const amount = defaults.amountCents ? (Math.abs(defaults.amountCents) / 100).toFixed(2) : "";
  const options: Option[] = [
    ...(split ? [{ value: "keep", label: `Split across ${defaults.splitCount} buckets` }] : []),
    ...bucketOptions(buckets, defaults.bucketId),
  ];

  return (
    <form action={formAction} className="nl-card form tx-form">
      <div className="nl-seg" role="radiogroup" aria-label="Money in or out">
        {[["out", "Money out"], ["in", "Money in"]].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={direction === value} onClick={() => setDirection(value)}>{label}</button>
        ))}
      </div>
      <input type="hidden" name="direction" value={direction} />

      <label className="field">
        <span>Merchant or description</span>
        <input className="input" name="merchant" defaultValue={defaults.merchant} placeholder="e.g. Superstore" required autoComplete="off" />
      </label>

      <div className="form-row">
        <label className="field">
          <span>Amount</span>
          <span className="input-money"><span aria-hidden>$</span>
            <input className="input" name="amount" inputMode="decimal" defaultValue={amount} placeholder="0.00" required /></span>
        </label>
        <div className="field">
          <span id={`${id}-date`}>Date</span>
          <DateField name="date" defaultValue={defaults.date ?? isoDate(new Date())} labelledBy={`${id}-date`} />
        </div>
      </div>

      <div className="form-row">
        <div className="field menu-field">
          <span id={`${id}-account`}>Account</span>
          <input type="hidden" name="account_id" value={accountId} />
          <Menu labelledBy={`${id}-account`} value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </div>
        <div className="field menu-field">
          <span id={`${id}-bucket`}>Bucket</span>
          <input type="hidden" name="bucket_id" value={bucketId} />
          <Menu labelledBy={`${id}-bucket`} value={bucketId} onChange={setBucketId} options={options} />
        </div>
      </div>

      <label className="field">
        <span>Note <span className="field-hint">optional</span></span>
        <input className="input" name="note" defaultValue={defaults.note ?? ""} placeholder="e.g. Sara’s birthday gift" />
      </label>

      {bucketId && bucketId !== "keep" && bucketId !== initialBucket && (
        <label className="check">
          <input type="checkbox" name="learn" defaultChecked />
          Always use this bucket for this merchant
        </label>
      )}

      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      {state?.ok && <p className="msg msg-ok" role="status">{state.ok}</p>}

      <div className="form-actions">
        {children}
        <button className="nl-btn nl-btn-md nl-btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
