import { CURRENCY, LOCALE } from "./format.ts";

// In the household's currency and locale (./format), so "$14.50" in Canada and "14,50 €" in Germany.
const currency = (extra: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, ...extra });
const full = currency();
const whole = currency({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
const shortTenths = currency({ notation: "compact", maximumFractionDigits: 1 });
const shortWhole = currency({ notation: "compact", maximumFractionDigits: 0 });

/** "−$14.50" / "+$1,200.00" / "$0.00"; `trim` leaves the cents off whole amounts ("$1,200"). Uses a true minus sign (U+2212). */
export function formatCents(cents: number, { sign = true, trim = false }: { sign?: boolean; trim?: boolean } = {}): string {
  const text = (trim && cents % 100 === 0 ? whole : full).format(Math.abs(cents) / 100);
  if (!sign || cents === 0) return text;
  return cents < 0 ? `−${text}` : `+${text}`;
}

/** $1,240 → "$1.2K", $12,345 → "$12K", $999 → "$999": for axis ticks and tight labels. */
export function formatCompact(cents: number): string {
  const d = Math.abs(cents) / 100;
  const text = d >= 1000 && d < 10_000 ? shortTenths.format(d) : shortWhole.format(Math.round(d));
  return `${cents < 0 ? "−" : ""}${text}`;
}

/** "14.5", "$1,200", "14,50" → cents; null if it isn't a positive amount. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[$\s]/g, "").replace(/,(\d{2})$/, ".$1").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

/** Dates live in ./dates; still re-exported here for files that import it from money. */
export { isoDate } from "./dates.ts";
