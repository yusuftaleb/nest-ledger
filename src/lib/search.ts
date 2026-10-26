import { LOCALE, weekdayIndex } from "./format.ts";
import { formatCents } from "./money.ts";
import { isoDate } from "./dates.ts";

// Smart search: plain phrases like "tims over $10 last month" or "baby in 2025 by Sam" become filters.
// Everything is understood here, in the app: no AI service, so it is instant, private and free. Words that
// aren't a date, amount, bucket, account, person, kind or flag search merchants and notes. Quotes force text.

export type Slice = {
  /** Words matched against merchant and note (all must match). */
  text: string[];
  /** Inclusive start and exclusive end, YYYY-MM-DD. */
  from?: string; to?: string; dateLabel?: string;
  /** Absolute amount in cents, inclusive. */
  min?: number; max?: number;
  buckets: string[]; accounts: string[]; people: string[];
  /** spend, income, transfer, lent, refund */
  kinds: string[];
  /** review, split, unverified, foreign */
  flags: string[];
  /** "every October": one month of the year, 0–11, in every year the dates cover. */
  monthOfYear?: number;
  /** "average": show the typical month, not the total. Picks the view; filters nothing. */
  average?: boolean;
};

export type Chip = { kind: "date" | "month" | "average" | "amount" | "bucket" | "account" | "person" | "kind" | "flag" | "text"; label: string; token: string };

type Named = { id: string; name: string };
export type SearchContext = {
  today: Date;
  buckets: (Named & { parent_id?: string | null })[];
  accounts: (Named & { institution?: string | null })[];
  members: { user_id: string; display_name: string }[];
  userId?: string;
};

const emptySlice = (): Slice => ({ text: [], buckets: [], accounts: [], people: [], kinds: [], flags: [] });

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "sep", "sept", "september" → 8; anything shorter than 3 letters or not a month's start → -1. */
const monthIndex = (w: string) => (w.length < 3 ? -1 : MONTHS.findIndex((m) => m.startsWith(w) || (w === "sept" && m === "september")));
const STOP = new Set(["in", "on", "at", "from", "for", "the", "and", "with", "of", "spent", "spend", "a", "an", "to", "all", "my", "our", "show", "me"]);
const KIND_WORDS: Record<string, string> = {
  income: "income", earned: "income", paid: "income", pay: "income", salary: "income", deposits: "income",
  spending: "spend", expenses: "spend", expense: "spend", purchases: "spend", bought: "spend",
  transfer: "transfer", transfers: "transfer", moves: "transfer",
  refund: "refund", refunds: "refund", returns: "refund",
  lent: "lent", loans: "lent",
};
const FLAG_WORDS: Record<string, string> = {
  review: "review", unchecked: "review", uncategorized: "review", unsorted: "review",
  split: "split", splits: "split",
  unverified: "unverified", unmatched: "unverified",
  foreign: "foreign", usd: "foreign", eur: "foreign", egp: "foreign",
};
const FLAG_LABEL: Record<string, string> = { review: "Needs a look", split: "Split across buckets", unverified: "Not matched to a statement", foreign: "Foreign currency" };
const KIND_LABEL: Record<string, string> = { spend: "Spending", income: "Money in", transfer: "Transfers", refund: "Refunds", lent: "Lent" };

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}$.\s-]/gu, " ").replace(/\s+/g, " ").trim();
const singular = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const money = (cents: number) => formatCents(cents, { sign: false, trim: true });

/** "$14.50", "14.50", "$1,200", "15k" → cents, or null. */
function amountOf(w: string | undefined): number | null {
  if (!w) return null;
  const m = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?$/.exec(w);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return (whole * 100 + cents) * (m[3] ? 1000 : 1);
}

/** How many words at `j` say "in every year": "over the years", "across years", "each year", "every year", "by year". */
function yearsTail(words: string[], j: number): number {
  const [a, b, c] = [words[j], words[j + 1], words[j + 2]];
  if ((a === "over" || a === "across" || a === "through" || a === "in") && b === "the" && c === "years") return 3;
  if ((a === "over" || a === "across" || a === "through" || a === "by") && (b === "years" || b === "year")) return 2;
  if ((a === "each" || a === "every") && b === "year") return 2;
  if (a === "yearly") return 1;
  return 0;
}

function range(from: Date, to: Date, label: string) {
  return { from: isoDate(from), to: isoDate(to), label };
}

/**
 * Turn a search phrase into filters plus the chips that show what was understood.
 * Each chip carries the words it came from, so removing a chip removes exactly those words.
 */
export function parseSearch(input: string, ctx: SearchContext): { slice: Slice; chips: Chip[] } {
  const slice = emptySlice();
  const chips: Chip[] = [];
  // quoted phrases are always text
  const quoted: string[] = [];
  const rest = input.replace(/"([^"]+)"/g, (_, q: string) => { quoted.push(q.trim()); return " "; });
  const words = norm(rest).split(" ").filter(Boolean);
  const used = new Array(words.length).fill(false);
  const take = (i: number, n: number) => { for (let k = i; k < i + n; k++) used[k] = true; return words.slice(i, i + n).join(" "); };
  const y = ctx.today.getFullYear(), mo = ctx.today.getMonth(), d = ctx.today.getDate();
  const setDate = (r: { from: string; to: string; label: string }, token: string) => {
    slice.from = r.from; slice.to = r.to; slice.dateLabel = r.label;
    chips.push({ kind: "date", label: r.label, token });
  };
  const monthRange = (m: number, year: number) => range(new Date(year, m, 1), new Date(year, m + 1, 1),
    new Date(year, m, 1).toLocaleDateString(LOCALE, { month: "long", year: "numeric" }));
  const isYear = (w?: string) => !!w && /^(19|20)\d{2}$/.test(w);

  // one end of a span: "2026-07-14", "july", "jul 2026" or "2025"; `end` is exclusive
  type Point = { start: Date; end: Date; n: number; year: boolean; month: number; day: boolean };
  const pointAt = (j: number): Point | null => {
    const w = words[j], next = words[j + 1];
    if (!w) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
    if (iso) {
      const at = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return isNaN(at.getTime()) ? null : { start: at, end: new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1), n: 1, year: true, month: at.getMonth(), day: true };
    }
    const m = monthIndex(w);
    if (m >= 0) {
      const yr = isYear(next) ? Number(next) : y;
      return { start: new Date(yr, m, 1), end: new Date(yr, m + 1, 1), n: isYear(next) ? 2 : 1, year: isYear(next), month: m, day: false };
    }
    if (isYear(w)) return { start: new Date(Number(w), 0, 1), end: new Date(Number(w) + 1, 0, 1), n: 1, year: true, month: 0, day: false };
    return null;
  };
  const LINK = new Set(["to", "through", "thru", "till", "until", "-", "and"]);
  // built by hand: browsers disagree on "Jul 4" versus "Jul. 4"
  const dayLabel = (t: Date, withYear: boolean) => `${MONTHS[t.getMonth()][0].toUpperCase()}${MONTHS[t.getMonth()].slice(1, 3)} ${t.getDate()}${withYear ? `, ${t.getFullYear()}` : ""}`;
  const monthLabel = (t: Date, withYear: boolean) => t.toLocaleDateString(LOCALE, { month: "long", ...(withYear ? { year: "numeric" } : {}) });

  for (let i = 0; i < words.length; i++) {
    if (used[i]) continue;
    const w = words[i], n1 = words[i + 1], n2 = words[i + 2];

    // ---- dates ----
    // one month in every year: "every october", "octobers", "october over the years", "groceries in may each year"
    {
      const lead = (w === "every" || w === "each") && monthIndex(n1 ?? "") >= 0 ? 1 : 0;
      const at = words[i + lead];
      const m = lead ? monthIndex(at) : at.endsWith("s") ? MONTHS.indexOf(at.slice(0, -1)) : monthIndex(at);
      const tail = m >= 0 ? yearsTail(words, i + lead + 1) : 0;
      if (m >= 0 && (lead || tail || at.endsWith("s") && MONTHS.includes(at.slice(0, -1)))) {
        slice.monthOfYear = m;
        chips.push({ kind: "month", label: `Every ${MONTHS[m][0].toUpperCase()}${MONTHS[m].slice(1)}`, token: take(i, lead + 1 + tail) });
        continue;
      }
    }
    // a span: "july to oct", "from mar 2025 through feb", "2026-07-01 to 2026-08-15", "between may and july"
    {
      const lead = w === "from" || w === "between" ? 1 : 0;
      const a = pointAt(i + lead);
      const link = a && words[i + lead + a.n];
      const b = a && link && LINK.has(link) && (link !== "and" || w === "between") ? pointAt(i + lead + a.n + 1) : null;
      if (a && b && (a.day || monthIndex(words[i + lead]) >= 0 || isYear(words[i + lead]))) {
        // without years, the span ends at the latest such month and starts before it: in October,
        // "nov to feb" is last November to this February
        let end = b.end, start = a.start;
        if (!b.year) { const by = b.month > mo ? y - 1 : y; end = new Date(by, b.month + 1, 1); }
        if (!a.year) {
          const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
          start = new Date(a.month > last.getMonth() ? last.getFullYear() - 1 : last.getFullYear(), a.month, 1);
        }
        if (start < end) {
          const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
          const sameYear = start.getFullYear() === last.getFullYear();
          const label = a.day || b.day
            ? `${dayLabel(start, !sameYear)} to ${dayLabel(last, true)}`
            : `${monthLabel(start, !sameYear)} to ${monthLabel(last, true)}`;
          setDate(range(start, end, label), take(i, lead + a.n + 1 + b.n));
          continue;
        }
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(w) && pointAt(i)) {
      const p = pointAt(i)!;
      setDate(range(p.start, p.end, dayLabel(p.start, true)), take(i, 1));
      continue;
    }
    if ((w === "all" || w === "any") && n1 === "time") { setDate({ from: "1900-01-01", to: isoDate(new Date(y, mo, d + 1)), label: "All time" }, take(i, 2)); continue; }
    if (w === "today") { setDate(range(new Date(y, mo, d), new Date(y, mo, d + 1), "Today"), take(i, 1)); continue; }
    if (w === "yesterday") { setDate(range(new Date(y, mo, d - 1), new Date(y, mo, d), "Yesterday"), take(i, 1)); continue; }
    if ((w === "this" || w === "last" || w === "past") && (n1 === "week" || n1 === "month" || n1 === "quarter" || n1 === "year")) {
      const back = w === "this" ? 0 : 1;
      if (n1 === "week") {
        const first = new Date(y, mo, d - weekdayIndex(ctx.today) - 7 * back);
        setDate(range(first, new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7), back ? "Last week" : "This week"), take(i, 2));
      } else if (n1 === "month") {
        const r = monthRange(mo - back < 0 ? 12 + mo - back : mo - back, mo - back < 0 ? y - 1 : y);
        setDate({ ...r, label: `${back ? "Last month" : "This month"} (${r.label})` }, take(i, 2));
      } else if (n1 === "quarter") {
        const q = Math.floor(mo / 3) - back, qy = q < 0 ? y - 1 : y, qq = (q + 4) % 4;
        setDate(range(new Date(qy, qq * 3, 1), new Date(qy, qq * 3 + 3, 1), `${back ? "Last quarter" : "This quarter"} (Q${qq + 1} ${qy})`), take(i, 2));
      } else {
        setDate(range(new Date(y - back, 0, 1), new Date(y - back + 1, 0, 1), `${back ? "Last year" : "This year"} (${y - back})`), take(i, 2));
      }
      continue;
    }
    if ((w === "last" || w === "past") && n1 && /^\d+$/.test(n1) && n2 && /^(days?|weeks?|months?|years?)$/.test(n2)) {
      const k = Number(n1), unit = n2.replace(/s$/, "");
      const from = unit === "day" ? new Date(y, mo, d - k + 1) : unit === "week" ? new Date(y, mo, d - 7 * k + 1)
        : unit === "month" ? new Date(y, mo - k, d + 1) : new Date(y - k, mo, d + 1);
      setDate(range(from, new Date(y, mo, d + 1), `Last ${k} ${unit}${k === 1 ? "" : "s"}`), take(i, 3));
      continue;
    }
    if (/^q[1-4]$/.test(w)) {
      const q = Number(w[1]) - 1, qy = isYear(n1) ? Number(n1) : y;
      setDate(range(new Date(qy, q * 3, 1), new Date(qy, q * 3 + 3, 1), `Q${q + 1} ${qy}`), take(i, isYear(n1) ? 2 : 1));
      continue;
    }
    if ((w === "since" || w === "after" || w === "before" || w === "until") && n1) {
      const m = monthIndex(n1);
      const yr = isYear(n2) ? Number(n2) : isYear(n1) ? Number(n1) : null;
      if (m >= 0 || yr !== null) {
        const start = m >= 0 ? new Date(yr ?? (m > mo ? y - 1 : y), m, 1) : new Date(yr!, 0, 1);
        const after = w === "since" || w === "after";
        // "after March" starts once March is over; "since March" includes it
        const edge = w === "after" ? (m >= 0 ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start.getFullYear() + 1, 0, 1)) : start;
        const label = `${w[0].toUpperCase()}${w.slice(1)} ${m >= 0 ? start.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }) : yr}`;
        if (after) setDate({ from: isoDate(edge), to: isoDate(new Date(y, mo, d + 1)), label }, take(i, m >= 0 && isYear(n2) ? 3 : 2));
        else setDate({ from: "1900-01-01", to: isoDate(w === "until" ? (m >= 0 ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start.getFullYear() + 1, 0, 1)) : start), label }, take(i, m >= 0 && isYear(n2) ? 3 : 2));
        continue;
      }
    }
    if (monthIndex(w) >= 0 && (isYear(n1) || !ctx.accounts.concat(ctx.buckets).some((x) => norm(x.name).split(" ").includes(w)))) {
      const m = monthIndex(w);
      // a bare month means its latest occurrence: "september" in October is last month, in August it's last year's
      const yr = isYear(n1) ? Number(n1) : m > mo ? y - 1 : y;
      setDate(monthRange(m, yr), take(i, isYear(n1) ? 2 : 1));
      continue;
    }
    if (isYear(w)) { setDate(range(new Date(Number(w), 0, 1), new Date(Number(w) + 1, 0, 1), w), take(i, 1)); continue; }

    // ---- the typical month ----
    if (w === "average" || w === "averages" || w === "avg" || w === "monthly" || w === "per" && n1 === "month") {
      slice.average = true;
      chips.push({ kind: "average", label: "Monthly average", token: take(i, w === "per" ? 2 : 1) });
      continue;
    }

    // ---- amounts ----
    const cmp = w === "over" || w === "above" || w === ">" || w === "more" || w === "under" || w === "below" || w === "<" || w === "less";
    if (cmp) {
      const skip = (w === "more" || w === "less") && n1 === "than" ? 1 : 0;
      const a = amountOf(words[i + 1 + skip]);
      if (a !== null) {
        const over = w === "over" || w === "above" || w === ">" || w === "more";
        if (over) slice.min = a; else slice.max = a;
        chips.push({ kind: "amount", label: `${over ? "Over" : "Under"} ${money(a)}`, token: take(i, 2 + skip) });
        continue;
      }
    }
    if (w === "between" && amountOf(n1) !== null && words[i + 2] === "and" && amountOf(words[i + 3]) !== null) {
      slice.min = amountOf(n1)!; slice.max = amountOf(words[i + 3])!;
      chips.push({ kind: "amount", label: `${money(slice.min)} to ${money(slice.max)}`, token: take(i, 4) });
      continue;
    }
    const span = /^\$(\d+(?:\.\d{1,2})?)-\$?(\d+(?:\.\d{1,2})?)$/.exec(w);
    if (span) {
      slice.min = amountOf(span[1])!; slice.max = amountOf(span[2])!;
      chips.push({ kind: "amount", label: `${money(slice.min)} to ${money(slice.max)}`, token: take(i, 1) });
      continue;
    }
    if (w.startsWith("$") && amountOf(w) !== null) {
      const a = amountOf(w)!;
      slice.min = a; slice.max = a;
      chips.push({ kind: "amount", label: `Exactly ${money(a)}`, token: take(i, 1) });
      continue;
    }

    // ---- people ----
    const person = (word?: string) => !word ? undefined
      : word === "me" || word === "mine" ? ctx.members.find((m) => m.user_id === ctx.userId)
      : ctx.members.find((m) => norm(m.display_name).split(" ")[0] === word);
    if (w === "by" && person(n1)) {
      const p = person(n1)!;
      if (!slice.people.includes(p.user_id)) slice.people.push(p.user_id);
      chips.push({ kind: "person", label: `By ${p.display_name}`, token: take(i, 2) });
      continue;
    }

    // ---- kinds and flags (two-word forms first) ----
    if ((w === "needs" || w === "need") && (n1 === "review" || n1 === "a" && n2 === "look")) {
      if (!slice.flags.includes("review")) slice.flags.push("review");
      chips.push({ kind: "flag", label: FLAG_LABEL.review, token: take(i, n1 === "a" ? 3 : 2) });
      continue;
    }
    if (w === "money" && (n1 === "in" || n1 === "out")) {
      const k = n1 === "in" ? "income" : "spend";
      if (!slice.kinds.includes(k)) slice.kinds.push(k);
      chips.push({ kind: "kind", label: KIND_LABEL[k], token: take(i, 2) });
      continue;
    }
    if (KIND_WORDS[w]) {
      const k = KIND_WORDS[w];
      if (!slice.kinds.includes(k)) slice.kinds.push(k);
      chips.push({ kind: "kind", label: KIND_LABEL[k], token: take(i, 1) });
      continue;
    }
    if (FLAG_WORDS[w]) {
      const f = FLAG_WORDS[w];
      if (!slice.flags.includes(f)) slice.flags.push(f);
      chips.push({ kind: "flag", label: FLAG_LABEL[f], token: take(i, 1) });
      continue;
    }

    // ---- buckets and accounts: the longest run of words that names one ----
    let matched = false;
    for (let len = Math.min(4, words.length - i); len >= 1 && !matched; len--) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const phrase = words.slice(i, i + len).join(" ");
      const exact = (name: string) => {
        const n = norm(name);
        return n === phrase || n.split(" ").map(singular).join(" ") === phrase.split(" ").map(singular).join(" ")
          || n.replace(/ and /g, " ") === phrase || (len === 1 && phrase.length >= 4 && n.startsWith(phrase));
      };
      const bucketHits = ctx.buckets.filter((b) => exact(b.name));
      if (bucketHits.length) {
        for (const b of bucketHits) if (!slice.buckets.includes(b.id)) slice.buckets.push(b.id);
        chips.push({ kind: "bucket", label: bucketHits.map((b) => b.name).join(", "), token: take(i, len) });
        matched = true;
        break;
      }
      const accountHits = ctx.accounts.filter((a) => exact(a.name) || (len === 1 && a.institution && norm(a.institution) === phrase)
        || (len === 1 && phrase.length >= 3 && norm(a.name).split(" ").includes(phrase)));
      if (accountHits.length) {
        for (const a of accountHits) if (!slice.accounts.includes(a.id)) slice.accounts.push(a.id);
        chips.push({ kind: "account", label: accountHits.map((a) => a.name).join(", "), token: take(i, len) });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (person(w) && w.length >= 3) {
      const p = person(w)!;
      if (!slice.people.includes(p.user_id)) slice.people.push(p.user_id);
      chips.push({ kind: "person", label: `By ${p.display_name}`, token: take(i, 1) });
      continue;
    }
  }

  // whatever is left searches merchants and notes
  const leftover = words.filter((w, i) => !used[i] && !STOP.has(w) && w !== "by" && w !== "than");
  for (const t of [...quoted, ...leftover]) {
    slice.text.push(t.toLowerCase());
    chips.push({ kind: "text", label: `“${t}”`, token: quoted.includes(t) ? `"${t}"` : t });
  }
  return { slice, chips };
}

/** The search text with one chip's words taken out, so tapping × on a chip edits the query. */
export function withoutChip(input: string, chip: Chip): string {
  if (chip.token.startsWith('"')) return input.replace(chip.token, "").replace(/\s+/g, " ").trim();
  const words = norm(input.replace(/"[^"]+"/g, (q) => q.replace(/\s/g, "\u0000"))).split(" ");
  const drop = chip.token.split(" ");
  for (let i = 0; i + drop.length <= words.length; i++) {
    if (drop.every((d, k) => words[i + k] === d)) {
      words.splice(i, drop.length);
      break;
    }
  }
  return words.join(" ").replace(/\u0000/g, " ").trim();
}

// ---- matching ----

type TxLike = {
  date: string; merchant: string; amount_cents: number; note?: string | null; account_id: string; created_by?: string | null;
  needs_review?: boolean; verified?: boolean; orig_currency?: string | null;
  splits: { amount_cents: number; bucket_id: string | null }[];
};
type BucketKind = { id: string; parent_id?: string | null; kind: string };

/** Every bucket id under the chosen ones (children, grandchildren), so "Baby" includes "Diapers". */
function expandBuckets(ids: string[], buckets: { id: string; parent_id?: string | null }[]): Set<string> {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of buckets) if (b.parent_id && out.has(b.parent_id) && !out.has(b.id)) { out.add(b.id); grew = true; }
  }
  return out;
}

const kindOf = (bucketId: string | null, amount: number, buckets: BucketKind[]) => {
  const b = bucketId ? buckets.find((x) => x.id === bucketId) : undefined;
  const k = b?.kind ?? (amount < 0 ? "spend" : "income");
  return k === "spend" && amount > 0 ? "refund" : k;
};

/** Does a transaction match? Buckets and kinds match if any of its splits does. */
export function matchesTransaction(t: TxLike, s: Slice, buckets: BucketKind[]): boolean {
  if (s.from && t.date < s.from) return false;
  if (s.to && t.date >= s.to) return false;
  if (s.monthOfYear !== undefined && Number(t.date.slice(5, 7)) - 1 !== s.monthOfYear) return false;
  const abs = Math.abs(t.amount_cents);
  if (s.min !== undefined && abs < s.min) return false;
  if (s.max !== undefined && abs > s.max) return false;
  if (s.accounts.length && !s.accounts.includes(t.account_id)) return false;
  if (s.people.length && !(t.created_by && s.people.includes(t.created_by))) return false;
  if (s.buckets.length) {
    const ids = expandBuckets(s.buckets, buckets);
    if (!t.splits.some((x) => x.bucket_id && ids.has(x.bucket_id))) return false;
  }
  if (s.kinds.length && !t.splits.some((x) => s.kinds.includes(kindOf(x.bucket_id, x.amount_cents, buckets)))
      && !(t.splits.length === 0 && s.kinds.includes(t.amount_cents < 0 ? "spend" : "income"))) return false;
  for (const f of s.flags) {
    if (f === "review" && !(t.needs_review || t.splits.length === 0 || t.splits.some((x) => !x.bucket_id))) return false;
    if (f === "split" && t.splits.length < 2) return false;
    if (f === "unverified" && t.verified) return false;
    if (f === "foreign" && !t.orig_currency) return false;
  }
  if (s.text.length) {
    const hay = `${t.merchant} ${t.note ?? ""}`.toLowerCase();
    if (!s.text.every((w) => hay.includes(w))) return false;
  }
  return true;
}

type LineLike = {
  /** The month the line counts for, when a month rule moved it (rent sent early); otherwise its date's month. */
  month?: string;
  date: string; merchant: string; amount_cents: number; account_id: string; bucket_id: string | null; kind: string;
  person: string | null; needs_review?: boolean; verified?: boolean; transaction_id?: string;
};

/** The same filters on rows of the lines view (one per split), for charts and the Analysis tab. */
export function matchesLine(l: LineLike, s: Slice, ctx: { buckets: { id: string; parent_id?: string | null }[]; members: { user_id: string; display_name: string }[]; splitCount?: Map<string, number> }): boolean {
  if (s.from && l.date < s.from) return false;
  if (s.to && l.date >= s.to) return false;
  if (s.monthOfYear !== undefined && Number((l.month ?? l.date).slice(5, 7)) - 1 !== s.monthOfYear) return false;
  const abs = Math.abs(l.amount_cents);
  if (s.min !== undefined && abs < s.min) return false;
  if (s.max !== undefined && abs > s.max) return false;
  if (s.accounts.length && !s.accounts.includes(l.account_id)) return false;
  if (s.people.length) {
    const names = ctx.members.filter((m) => s.people.includes(m.user_id)).map((m) => m.display_name);
    if (!l.person || !names.includes(l.person)) return false;
  }
  if (s.buckets.length) {
    const ids = expandBuckets(s.buckets, ctx.buckets);
    if (!l.bucket_id || !ids.has(l.bucket_id)) return false;
  }
  if (s.kinds.length) {
    const k = l.kind === "spend" && l.amount_cents > 0 ? "refund" : l.kind;
    if (!s.kinds.includes(k) && !(s.kinds.includes("spend") && k === "refund")) return false;
  }
  for (const f of s.flags) {
    if (f === "review" && !(l.needs_review || !l.bucket_id)) return false;
    if (f === "unverified" && l.verified) return false;
    if (f === "split" && !(l.transaction_id && (ctx.splitCount?.get(l.transaction_id) ?? 1) > 1)) return false;
  }
  if (s.text.length && !s.text.every((w) => l.merchant.toLowerCase().includes(w))) return false;
  return true;
}
