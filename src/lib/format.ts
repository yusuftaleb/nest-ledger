/**
 * How this copy writes money and dates. One copy serves one household, so these are set once per deploy
 * (NEXT_PUBLIC_CURRENCY, NEXT_PUBLIC_LOCALE, NEXT_PUBLIC_WEEK_START in Vercel → Settings → Environment
 * Variables, or .env.local) and are the same on the server and in the browser. Changing one needs a redeploy.
 */

/** The household's own currency: every amount_cents is in it. ISO code such as CAD, USD, EUR. */
export const CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "CAD").toUpperCase();

/** Language and region for numbers and dates, such as en-CA, en-US, en-GB, fr-CA. */
export const LOCALE = process.env.NEXT_PUBLIC_LOCALE || "en-CA";

/** The first day of the week: 1 = Monday (default), 0 = Sunday. */
export const WEEK_START: 0 | 1 = process.env.NEXT_PUBLIC_WEEK_START === "0" ? 0 : 1;

/** A date's place in the household's week: 0 is the first day (Monday or Sunday). */
export const weekdayIndex = (d: Date) => (d.getDay() - WEEK_START + 7) % 7;

/** Weekday names in the household's order, starting from its first day. */
export function weekdayNames(style: "long" | "short" | "narrow" = "long"): string[] {
  const fmt = new Intl.DateTimeFormat(LOCALE, { weekday: style });
  // 2024-01-07 was a Sunday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + WEEK_START + i)));
}
