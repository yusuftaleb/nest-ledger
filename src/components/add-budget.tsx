"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { CalendarDays, History, Tag } from "lucide-react";
import { Menu } from "./menu";
import { usePeek } from "./peek";
import { CategoryIcon } from "./icons";
import { setBudget } from "@/lib/actions";
import { bucketMenu } from "@/lib/buckets";
import { formatCents, parseAmount } from "@/lib/money";
import type { BudgetPlan } from "@/lib/budget-plan";

const money = (cents: number) => formatCents(cents, { sign: false, trim: true });
const per = (period: string) => (period === "year" ? "year" : "month");

/**
 * A budget as one small page, in the same shape as a new transaction: how often up top, the amount large,
 * then the bucket and what it usually spends as quiet rows. Picking a bucket that already has a budget
 * fills in that budget, so the same form changes or removes it.
 */
export function AddBudget({ plan, bucket: initial }: { plan: BudgetPlan; bucket?: string }) {
  const id = useId();
  const peek = usePeek();
  const start = initial && plan.buckets.some((b) => b.id === initial) ? initial : "";
  const [bucketId, setBucketId] = useState(start);
  const [period, setPeriod] = useState(plan.current[start]?.period === "year" ? "year" : "month");
  const [amount, setAmount] = useState(() => (plan.current[start] ? (plan.current[start].amount_cents / 100).toString() : ""));
  const [rollover, setRollover] = useState(plan.current[start]?.rollover ?? false);
  const options = useMemo(() => bucketMenu(plan.buckets), [plan.buckets]);

  const bucket = plan.buckets.find((b) => b.id === bucketId);
  const current = bucketId ? plan.current[bucketId] : undefined;
  const usual = bucketId ? plan.usual[bucketId] : undefined;
  const usualFor = usual === undefined ? undefined : period === "year" ? usual * 12 : usual;
  const cents = parseAmount(amount);
  const ready = !!bucket && cents !== null && cents > 0;
  // rollover is a monthly idea: a yearly budget already has the whole year to even out
  const rolls = period === "month" && rollover;
  const same = !!current && current.amount_cents === cents && per(current.period) === period && current.rollover === rolls;

  const pick = (next: string) => {
    setBucketId(next);
    // a bucket with a budget opens on it, so the form edits rather than guesses
    const had = plan.current[next];
    if (had) { setAmount((had.amount_cents / 100).toString()); setPeriod(per(had.period)); setRollover(had.rollover); }
  };

  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof setBudget>>, form: FormData) => {
    const result = await setBudget(prev, form);
    if (result?.ok && peek) peek.close();
    return result;
  }, null);

  return (
    <form action={formAction} className="composer"
      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) { e.preventDefault(); e.currentTarget.requestSubmit(); } }}>
      <input type="hidden" name="bucket_id" value={bucketId} />
      <input type="hidden" name="period" value={period} />
      {rolls && <input type="hidden" name="rollover" value="on" />}

      <div className="nl-seg composer-dir" role="radiogroup" aria-label="How often">
        {(["month", "year"] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={period === value} onClick={() => setPeriod(value)}>
            {value === "month" ? "Every month" : "Every year"}
          </button>
        ))}
      </div>

      <div className="composer-hero">
        <CategoryIcon icon={bucket?.icon} color={bucket?.color} seed={bucket?.id ?? "budget"} />
        <h2 className={`composer-title${bucket ? "" : " is-empty"}`}>{bucket ? `${bucket.name} budget` : "New budget"}</h2>
      </div>

      <label className="composer-amount">
        <span className="composer-sign" aria-hidden>$</span>
        <input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0" required autoComplete="off" autoFocus={!!start} data-autofocus={start ? "" : undefined}
          aria-label={`Amount a ${period}`} style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }} />
        <span className="composer-per" aria-hidden>a {period}</span>
      </label>

      <div className="props" role="group" aria-label="Details">
        <div className="prop">
          <span className="prop-label" id={`${id}-bucket`}><Tag size={16} strokeWidth={1.75} aria-hidden />Bucket</span>
          <div className="prop-value">
            <Menu compact labelledBy={`${id}-bucket`} value={bucketId} onChange={pick} options={options} placeholder="Pick a bucket" />
          </div>
        </div>
        <div className="prop">
          <span className="prop-label"><CalendarDays size={16} strokeWidth={1.75} aria-hidden />Starts</span>
          <div className="prop-value"><span className="prop-text">{plan.startsLabel}</span></div>
        </div>
        <div className="prop">
          <span className="prop-label"><History size={16} strokeWidth={1.75} aria-hidden />Usually</span>
          <div className="prop-value">
            {!bucket ? <span className="prop-note">Pick a bucket to see what it spends</span>
              : usualFor === undefined ? <span className="prop-note">Nothing spent {plan.usualLabel}</span>
              : <>
                  <span className="prop-text">{money(usualFor)} a {period} <span className="prop-note">on average, {plan.usualLabel}</span></span>
                  {cents !== usualFor && (
                    <button type="button" className="prop-chip" onClick={() => setAmount((usualFor / 100).toFixed(usualFor % 100 ? 2 : 0))}>Use {money(usualFor)}</button>
                  )}
                </>}
          </div>
        </div>
      </div>

      {period === "month" && (
        <label className="check composer-learn">
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
          Carry what’s left (or what goes over) into next month
        </label>
      )}

      {current && !same && (
        <p className="composer-learn">Replaces {money(current.amount_cents)} a {per(current.period)} from {plan.startsLabel}. Earlier months keep the old budget.</p>
      )}

      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      {state?.ok && !peek && <p className="msg msg-ok" role="status">{state.ok}</p>}

      <div className="composer-foot">
        <span className="composer-tip">Spending is counted in this bucket and every bucket inside it</span>
        {current && (
          <button className="nl-btn nl-btn-md nl-btn-ghost" disabled={pending} name="remove" value="1" formNoValidate>Remove budget</button>
        )}
        <button className="nl-btn nl-btn-md nl-btn-primary" disabled={pending || !ready || same} title="Save (⌘ Enter)">
          {pending ? "Saving…" : current ? "Save changes" : "Add budget"}
        </button>
      </div>
    </form>
  );
}
