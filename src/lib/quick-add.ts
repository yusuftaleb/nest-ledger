import { isoDate } from "./dates.ts";
import { parseAmount } from "./money.ts";

// Quick add turns "14.50 tims", "superstore 114.20 yesterday" or "+1200 payroll" into a transaction.
// Plain code, no AI: amount, optional date word, optional account word, the rest is the merchant.

export type QuickAccount = { id: string; name: string; institution: string | null; kind: string };
export type QuickBucket = { id: string; name: string; kind: string };
export type QuickRule = { pattern: string; bucket_id: string };

export type QuickAddResult = {
  amountCents: number;          // negative = spending, positive = income
  merchant: string;
  date: string;                 // YYYY-MM-DD
  accountId: string | null;     // null = use the default account
  bucketId: string | null;
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const GENERIC_ACCOUNT_WORDS = new Set(["card", "account", "the", "my"]);
// Words that name an institution by its first word ("pc" → "PC Financial") or an account kind.
const INSTITUTION_ALIASES: Record<string, string> = { pcf: "pc", presidents: "pc" };
const KIND_ALIASES: Record<string, string> = { debit: "chequing", chequing: "chequing", cash: "cash", savings: "savings", credit: "credit_card", visa: "credit_card", mastercard: "credit_card" };

function daysAgo(today: Date, n: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** Reads a date from tokens[i] (and maybe tokens[i+1]); returns the date and how many tokens it used. */
function readDate(tokens: string[], i: number, today: Date): [string, number] | null {
  const t = tokens[i];
  if (t === "today") return [isoDate(today), 1];
  if (t === "yesterday" || t === "yday") return [daysAgo(today, 1), 1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return [t, 1];

  const weekday = WEEKDAYS.findIndex((w) => t.startsWith(w) && t.length <= 9);
  if (weekday >= 0) {
    // the most recent such day before today
    const back = (today.getDay() - weekday + 7) % 7 || 7;
    return [daysAgo(today, back), 1];
  }

  const month = (s: string | undefined) => (s ? MONTHS.findIndex((m) => s.startsWith(m) && s.length <= 9) : -1);
  const day = (s: string | undefined) => (s && /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31 ? +s : 0);
  let m = month(t), d = day(tokens[i + 1]);
  if (m < 0 || !d) { m = month(tokens[i + 1]); d = day(t); }
  if (m >= 0 && d) {
    // a date later than today means last year ("dec 28" typed in January)
    let year = today.getFullYear();
    if (new Date(year, m, d) > today) year -= 1;
    return [isoDate(new Date(year, m, d)), 2];
  }
  return null;
}

function findAccount(token: string, accounts: QuickAccount[]): QuickAccount | undefined {
  const institution = INSTITUTION_ALIASES[token] ?? token;
  const byInstitution = accounts.find((a) => a.institution?.toLowerCase().split(/\s+/)[0] === institution);
  if (byInstitution) return byInstitution;
  const kind = KIND_ALIASES[token];
  if (kind) return accounts.find((a) => a.kind === kind);
  if (token.length < 4 || GENERIC_ACCOUNT_WORDS.has(token)) return undefined;
  return accounts.find((a) => a.name.toLowerCase().split(/\s+/).includes(token));
}

/** Longest matching rule wins, so "uber eats" beats "uber". Falls back to a bucket named in the text. */
export function guessBucket(text: string, buckets: QuickBucket[], rules: QuickRule[]): string | null {
  const lower = text.toLowerCase();
  const rule = rules
    .filter((r) => lower.includes(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule) return rule.bucket_id;

  const words = lower.split(/\s+/);
  const named = buckets.find((c) => {
    const first = c.name.toLowerCase().split(/[\s&/]+/)[0];
    return words.includes(c.name.toLowerCase()) || words.includes(first);
  });
  return named?.id ?? null;
}

export function parseQuickAdd(
  text: string,
  ctx: { today: Date; accounts: QuickAccount[]; buckets: QuickBucket[]; rules: QuickRule[] },
): QuickAddResult | null {
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let cents: number | null = null;
  let income = false;
  let date = isoDate(ctx.today);
  let account: QuickAccount | undefined;
  const merchantWords: string[] = [];
  const original = text.trim().split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (cents === null) {
      const signed = /^[+-]/.test(t);
      const value = parseAmount(signed ? t.slice(1) : t);
      if (value !== null) {
        cents = value;
        income = t.startsWith("+");
        continue;
      }
    }

    const readDateResult = readDate(tokens, i, ctx.today);
    if (readDateResult) {
      [date] = readDateResult;
      i += readDateResult[1] - 1;
      continue;
    }

    if (!account && i > 0) {
      // the first word is always merchant ("cash" alone could be a store); accounts come after it
      const found = findAccount(t, ctx.accounts);
      if (found) { account = found; continue; }
    }
    if (["on", "with", "via", "at"].includes(t) && i > 0) continue;

    merchantWords.push(original[i]);
  }

  if (cents === null || merchantWords.length === 0) return null;
  const merchant = merchantWords.join(" ");
  const bucketId = guessBucket(merchant, ctx.buckets, ctx.rules);
  if (ctx.buckets.find((b) => b.id === bucketId)?.kind === "income") income = true;

  return {
    amountCents: income ? cents : -cents,
    merchant: merchant.charAt(0).toUpperCase() + merchant.slice(1),
    date,
    accountId: account?.id ?? null,
    bucketId,
  };
}
