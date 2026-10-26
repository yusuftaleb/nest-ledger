import { CURRENCY, LOCALE } from "./format.ts";
import type { OwedRow } from "./types.ts";

export type OwedEntry = {
  person: string; amount_cents: number; date: string; due_date: string | null;
  attrs: Record<string, unknown>; reason?: string | null;
};

/** Valuations in the household's currency stay in amount_cents; repayment amounts keep the currency actually lent. */
export function groupOwed(entries: OwedEntry[]): OwedRow[] {
  const groups = new Map<string, OwedRow>();
  for (const entry of entries) {
    if (entry.amount_cents === 0) continue;
    const currency = entry.attrs.repayment_currency ?? CURRENCY;
    const amount = entry.attrs.repayment_amount_cents ?? entry.amount_cents;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
        typeof amount !== "number" || !Number.isSafeInteger(amount) ||
        (currency !== CURRENCY && entry.attrs.repayment_amount_cents === undefined)) {
      throw new Error("Invalid IOU repayment currency or amount");
    }
    const key = JSON.stringify([entry.person, currency]);
    const row = groups.get(key) ?? {
      person: entry.person, amount_cents: 0, repayment_amount_cents: 0, currency,
      items: 0, since: entry.date, next_due: null,
    };
    row.amount_cents += entry.amount_cents;
    row.repayment_amount_cents! += amount;
    row.items++;
    // what it was for, so a reminder can say so
    if (entry.reason && entry.amount_cents > 0) (row.reasons ??= []).push(entry.reason);
    if (entry.date < row.since) row.since = entry.date;
    if (entry.due_date && (!row.next_due || entry.due_date < row.next_due)) row.next_due = entry.due_date;
    groups.set(key, row);
  }
  return [...groups.values()].filter((r) => owedAmount(r) !== 0)
    .sort((a, b) => a.person.localeCompare(b.person) || (a.currency ?? CURRENCY).localeCompare(b.currency ?? CURRENCY));
}

export const owedAmount = (row: OwedRow) => row.repayment_amount_cents ?? row.amount_cents;

export function formatOwed(cents: number, currency = CURRENCY): string {
  return `${new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(Math.abs(cents) / 100)} ${currency}`;
}

/** Never add euro cents and Canadian cents into the same total. */
export function owedTotals(rows: OwedRow[]): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency ?? CURRENCY;
    totals.set(currency, (totals.get(currency) ?? 0) + owedAmount(row));
  }
  return [...totals].map(([currency, amount]) => formatOwed(amount, currency)).join(" · ");
}
