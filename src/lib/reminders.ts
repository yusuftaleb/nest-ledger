import type { Bill } from "./insights";

export type DueSoon = { merchant: string; amount: number; date: string; days: number };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Bills due in the next few days (today included): one not yet seen this month whose usual day is coming, or one
 * already paid this month whose next charge falls early next month (rent on the 1st, seen from the 29th).
 */
export function dueSoon(bills: Bill[], today: Date, within = 3): DueSoon[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const on = (monthOffset: number, day: number) => {
    const last = new Date(start.getFullYear(), start.getMonth() + monthOffset + 1, 0).getDate();
    return new Date(start.getFullYear(), start.getMonth() + monthOffset, Math.min(day, last));
  };
  const out: DueSoon[] = [];
  for (const b of bills) {
    const due = on(b.paid === null ? 0 : 1, b.day);
    const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
    if (days >= 0 && days <= within) out.push({ merchant: b.merchant, amount: b.amount, date: iso(due), days });
  }
  return out.sort((a, b) => a.days - b.days || b.amount - a.amount);
}
