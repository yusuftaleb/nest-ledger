import Link from "next/link";
import { BucketIcon } from "./bucket-icon";
import { money } from "./charts";

/**
 * The design system's BudgetBar: what's left in large text, spent of budget in small text, and a bar that is
 * green below 80%, orange from 80% and red past 100%. The state is also in words ("$32 over"), never colour alone.
 * Stack them inside one card; they divide themselves with hairlines.
 */
export function BudgetBar({ name, icon, color, seed, spent, budget, carry = 0, index = 0, href }: {
  name: string; icon?: string | null; color?: string | null; seed?: string; spent: number; budget: number;
  /** Already in `budget`: what rolled over from last month (negative when last month went over). */
  carry?: number; index?: number;
  /** Opens this budget's transactions. */
  href?: string;
}) {
  const left = budget - spent;
  const state = left < 0 ? "over" : spent >= budget * 0.8 ? "warn" : "ok";
  const scale = Math.max(spent, budget, 1);
  return (
    <div className="nl-budget">
      <div className="nl-budget-top">
        {href
          ? <Link href={href} scroll={false} className="nl-budget-name num-link"><BucketIcon icon={icon} color={color} seed={seed} small />{name}</Link>
          : <span className="nl-budget-name"><BucketIcon icon={icon} color={color} seed={seed} small />{name}</span>}
        <span className={`nl-budget-left ${state}`}>{left < 0 ? `${money(-left)} over` : `${money(left)} left`}</span>
      </div>
      <div className="nl-track" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={spent} aria-label={`${name}: ${money(spent)} of ${money(budget)}`}>
        <span className={`nl-fill ${state}`} style={{ width: `${(Math.min(spent, scale) / scale) * 100}%`, "--i": index } as React.CSSProperties} />
        {left < 0 && <span className="nl-limit" style={{ left: `${(budget / scale) * 100}%` }} />}
      </div>
      <span className="nl-budget-meta">{money(spent)} of {money(budget)}
        {carry !== 0 && <> · {carry > 0 ? `${money(carry)} carried over` : `${money(-carry)} over last month taken off`}</>}</span>
    </div>
  );
}
