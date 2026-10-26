"use client";

import { CURRENCY } from "@/lib/format";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, HandCoins, Send } from "lucide-react";
import { lendFromTransaction, repaidByTransaction, settleOwed, type FormState } from "@/lib/actions";
import { Menu } from "./menu";
import { DateField } from "./date-picker";

/**
 * Per person in "Money owed": a nudge for someone who owes you (the phone's share sheet, or the clipboard
 * on a computer), and a way to close it all when it was settled outside the accounts (cash, a favour).
 */
export function OwedActions({ person, amount, reasons, currency, theirs, demo }: {
  person: string; amount: string; reasons?: string[]; currency?: string; theirs: boolean; demo?: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text: string) => { setNote(text); clearTimeout(timer.current); timer.current = setTimeout(() => { setNote(null); setArmed(false); }, 2600); };

  const remind = async () => {
    const first = person.split(" ")[0];
    const what = reasons?.length ? ` for ${reasons.slice(0, 2).join(" and ").toLowerCase()}` : "";
    const text = `Hi ${first}, just a friendly reminder about the ${amount}${what}. Thanks!`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      flash("Message copied");
    } catch { /* closed the share sheet */ }
  };

  const settle = () => {
    if (demo) { flash("Not in the demo"); return; }
    if (!armed) { setArmed(true); flash(theirs ? "Tap again: they paid it all" : "Tap again: you paid it all"); return; }
    start(async () => { const r = await settleOwed(person, currency ?? CURRENCY); flash(r?.error ?? "Settled"); });
  };

  return (
    <span className="owed-actions">
      {note && <span className="caption owed-note" role="status">{note}</span>}
      {theirs && (
        <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={remind} title={`Remind ${person}`}>
          <Send size={14} strokeWidth={1.75} aria-hidden />Remind
        </button>
      )}
      <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" data-armed={armed || undefined} onClick={settle} disabled={pending}
        title={theirs ? `${person} paid you back in full` : `You paid ${person} back in full`}>
        <Check size={14} strokeWidth={2} aria-hidden />{pending ? "Saving…" : theirs ? "Paid back" : "Paid"}
      </button>
    </span>
  );
}

/**
 * The lending part of one transaction. Money out: "someone owes us for this" (all of it, or their share of a bill).
 * Money in: "this is someone paying us back". Either way the transaction leaves spending and income.
 */
export function LendingPanel({ transactionId, cents, people }: { transactionId: string; cents: number; people: string[] }) {
  const id = useId();
  const out = cents < 0;
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState(people[0] ?? "");
  const [state, action, pending] = useActionState<FormState, FormData>(
    (out ? lendFromTransaction : repaidByTransaction).bind(null, transactionId), null);

  if (state?.ok) return <p className="msg msg-ok" role="status">{state.ok}</p>;
  if (!out && people.length === 0) return null; // nobody owes us, so this can't be a repayment
  if (!open) {
    return (
      <button type="button" className="nl-btn nl-btn-md nl-btn-secondary lend-open" onClick={() => setOpen(true)}>
        <HandCoins size={16} strokeWidth={1.75} aria-hidden />{out ? "Someone owes us for this" : "This is someone paying us back"}
      </button>
    );
  }
  return (
    <form action={action} className="lend-form">
      {out ? (
        <>
          <label className="field"><span>Who</span>
            <input className="input" name="person" list={`${id}-people`} required autoFocus autoComplete="off" placeholder="Their name" />
            <datalist id={`${id}-people`}>{people.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <div className="lend-pair">
          <label className="field"><span>How much</span>
            <input className="input" name="amount" inputMode="decimal" required defaultValue={(Math.abs(cents) / 100).toFixed(2)} autoComplete="off" />
          </label>
          <div className="field"><span id={`${id}-due`}>Pay back by <i className="caption">(optional)</i></span>
            <DateField name="due_date" placeholder="No date" clearable labelledBy={`${id}-due`} />
          </div>
          </div>
          <p className="caption lend-hint">All of it: it moves to “Lent to others” and stops counting as your spending. Part of it: it stays where it is.</p>
        </>
      ) : (
        <div className="field menu-field"><span id={`${id}-who`}>Who paid you back</span>
          <input type="hidden" name="person" value={person} />
          <Menu labelledBy={`${id}-who`} value={person} onChange={setPerson} options={people.map((p) => ({ value: p, label: p }))} />
        </div>
      )}
      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      <div className="lend-foot">
        <button type="button" className="nl-btn nl-btn-md nl-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="nl-btn nl-btn-md nl-btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
