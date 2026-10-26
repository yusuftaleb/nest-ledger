import { LOCALE } from "./format.ts";
// Calendar dates as YYYY-MM-DD strings, read and written in local time (the device's zone, never UTC).

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening entries keep today's date). */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD → that day at local midnight. */
export const parseIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDaysIso = (iso: string, n: number) => { const d = parseIso(iso); return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
export const addMonths = (iso: string, n: number) => { const d = parseIso(iso); return isoDate(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())); };

/** "Oct 5". */
export function formatDate(iso: string): string {
  return parseIso(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}
