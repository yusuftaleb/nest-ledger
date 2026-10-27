import { CURRENCY, LOCALE } from "@/lib/format";
import Link from "next/link";
import { tidyMerchant } from "@/lib/merchant";
import { ShowMore } from "@/components/show-more";
import { ArrowRight, Bell, Check, Sprout, TrendingDown, TrendingUp } from "lucide-react";
import { Columns, Legend, Matrix, PaceChart, PairedColumns, SignedColumns, SpendCalendar, ChartTable, compact, money } from "@/components/charts";
import { bucketColor, iconProps } from "@/components/icons";
import { BucketIcon, IconByName } from "@/components/bucket-icon";

import { TransactionList } from "@/components/transaction-list";
import { Amount } from "@/components/ui";
import {
  applyFilter, asPeriod, budgetFor, bucketsUnder, carryInto, groupLines, inRange, lastMonths, periodRange, sumMeasure,
  type Filter, type PeriodKey, type Range,
} from "@/lib/dashboard";
import type { Balance, DashboardSource } from "@/lib/dashboard-source";
import {
  bucketMonths, buildInsights, buildOutlook, cashflow, changes, comparison, covers, cumulativeRange, currentBalances, dailySpend, forecastMonth, merchants,
  payoffPlan, recurring, savingsRates, weekdayAverages, type Insight,
  type CurrentBalance,
} from "@/lib/insights";
import { addDaysIso, formatDate, isoDate, parseIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";

/** The balance in the "tell your agent" examples, in the household's own currency. */
const EXAMPLE_BALANCE = formatCents(230000, { sign: false, trim: true });
import { formatOwed, owedAmount, owedTotals } from "@/lib/owed";
import { OwedActions } from "./owed-actions";
import { monthTick } from "@/lib/explore";
import { needsLook, type Budget, type Line, type OwedRow, type TransactionRow, type Widget } from "@/lib/types";
import { ChartTip } from "@/components/chart-tip";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { cookies } from "next/headers";
import { matchesLine, type Slice } from "@/lib/search";
import { BudgetBar } from "@/components/budget-bar";
import { Private } from "@/components/private-amount";
import { GoalsCard, type GoalView } from "@/components/goals-card";
import type { AiRead } from "@/lib/ai-insights";
import { getZone } from "@/lib/today";
import { NotABill } from "@/components/not-a-bill";
import { dueSoon } from "@/lib/reminders";
import { countedLines } from "@/lib/month-rules";

// Draws the `widgets` rows for a page. Adding or changing a dashboard card is a database edit:
// see the comment on the widgets table (and HANDOFF.md) for the types and spec keys.

const KNOWN = ["summary", "insights", "ai", "outlook", "pace", "stat", "bars", "compare", "share", "trend", "cashflow", "savings_rate", "matrix",
  "calendar", "weekday", "bills", "upcoming", "balances", "forecast", "debts", "owed", "transfers", "merchants", "budgets", "goals", "net_worth", "recent", "review", "week", "view"];
const MEASURE_LABEL: Record<string, string> = { spend: "Spent", income: "Income", net: "Net", total: "Total" };
/** How wide a card is on desktop when its spec doesn't say: full = whole row, wide = ⅔, half, third. */
const DEFAULT_SPAN: Record<string, string> = {
  summary: "full", ai: "full", matrix: "full", pace: "wide", cashflow: "wide", savings_rate: "wide", net_worth: "wide",
  insights: "third", outlook: "third", weekday: "third", stat: "third", bills: "third", goals: "third", forecast: "third",
};
/** Cards that look back a year by default; the rest default to 6 months. */
const YEARLY = ["matrix", "savings_rate"];

type Spec = {
  measure?: string; group_by?: string; top?: number; months?: number; limit?: number; period?: string;
  filter?: Filter; view?: string; span?: string; extra?: number; method?: string;
};
type Ctx = {
  s: DashboardSource; selected: Range; today: Date; live: boolean; forced?: boolean; privateBalances: boolean; lines: Line[]; budgets: Budget[]; txs: TransactionRow[];
  goalLines: Pick<Line, "bucket_id" | "amount_cents">[]; balances: Balance[]; owed: OwedRow[];
  /** The months before a budget month, for budgets that roll over (empty when none do). */
  carryLines: Line[];
  /** Every account as of today, whatever period or filter the page shows. */
  now: CurrentBalance[];
  /** Codex's latest read of the household, when it applies to what the page shows. */
  ai: AiRead | null;
  /** The viewer's time zone, for when Codex wrote its insights. */
  zone: string;
};

const specOf = (w: Widget) => (w.spec ?? {}) as Spec;
/** A search for a range's dates, in the words smart search reads. */
const datesQuery = (r: { start: string | null; end: string }) => (r.start ? `${r.start} to ${addDaysIso(r.end, -1)}` : "all time");
/** The transactions behind a number, opened as a peek over the page. */
const listHref = (q: string, title: string) => `/transactions/list?${new URLSearchParams({ q, t: title })}`;
/** A card's dates: its own `period` when it has one, except on a page whose filters choose the dates for every card. */
const rangeOf = (spec: Spec, ctx: Pick<Ctx, "selected" | "today"> & { forced?: boolean }): Range =>
  ctx.forced || !spec.period || spec.period === "selected" ? ctx.selected : periodRange(asPeriod(spec.period), ctx.today);
const monthsOf = (spec: Spec, today: Date, type = "") => lastMonths(Number(spec.months) || (YEARLY.includes(type) ? 12 : 6), today);
/**
 * The months a monthly chart shows. On a page whose filters choose the dates (Analysis), a stretch of three months
 * or more is shown month by month (all time from the first transaction, at most 36); a shorter one shows the months
 * up to its end, so a single month still has its year around it.
 */
function monthsFor(spec: Spec, ctx: Ctx, type = "") {
  const fallback = monthsOf(spec, ctx.today, type);
  if (!ctx.forced) return fallback;
  const first = ctx.selected.start ?? ctx.lines.reduce<string | null>((m, l) => (m === null || l.date < m ? l.date : m), null);
  if (!first) return fallback;
  const from = parseIso(first), last = parseIso(addDaysIso(ctx.selected.end, -1));
  const n = (last.getFullYear() - from.getFullYear()) * 12 + last.getMonth() - from.getMonth() + 1;
  return n >= 3 ? lastMonths(Math.min(n, 240), last) : fallback;
}
const monthsBack = (today: Date, n: number) => isoDate(new Date(today.getFullYear(), today.getMonth() - n, 1));
const monthLabel = (m: string, opts: Intl.DateTimeFormatOptions = { month: "short" }) =>
  new Date(`${m}T12:00`).toLocaleDateString(LOCALE, opts);
const thisMonth = (today: Date) => periodRange("month", today);
/** A month column's labels: "Nov '25" on the first and on January, "Dec" otherwise, and one letter for narrow cards. */
const tick = (m: string, i: number) => ({ label: monthTick(new Date(`${m}T12:00`), i === 0), short: monthLabel(m, { month: "narrow" }) });
const lastMonth = (today: Date) => periodRange("month", new Date(today.getFullYear(), today.getMonth() - 1, 15));

/** The earliest date any card on the page needs, so lines load once. */
function startNeeded(widgets: Widget[], selected: Range, today: Date): string | null {
  const starts: (string | null)[] = [selected.start, lastMonth(today).start];
  for (const w of widgets) {
    const spec = specOf(w);
    if (["trend", "cashflow", ...YEARLY].includes(w.type)) starts.push(monthsOf(spec, today, w.type)[0]);
    else if (w.type === "weekday") starts.push(isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * 12)));
    else if (w.type === "bills" || w.type === "forecast" || w.type === "upcoming") starts.push(monthsBack(today, 4));
    else if (w.type === "week") starts.push(addDaysIso(isoDate(today), -13));
    else {
      if (w.type === "insights") starts.push(monthsBack(today, 4));
      if (w.type === "outlook") starts.push(monthsBack(today, 12));
      const r = rangeOf(spec, { selected, today });
      starts.push(r.start);
      const cmp = comparison(r, today);
      if (cmp) starts.push(cmp.before.start);
    }
  }
  return starts.includes(null) ? null : (starts as string[]).sort()[0];
}

/**
 * `today` is the date every card measures from: the real today for the current period, or the last day of a past
 * one. `live` is false for a past period, which hides the cards that only make sense now (forecast, "can spend a day").
 */
export async function WidgetBoard({ source: s, page, period, today = new Date(), live = true, range, filter }: {
  source: DashboardSource; page: string; period: PeriodKey; today?: Date; live?: boolean;
  /** Dates chosen by the page (Analysis): every card shows this stretch instead of its own period. */
  range?: Range;
  /** Bucket, account, person, kind and word filters applied to every card's lines. */
  filter?: Slice;
}) {
  const selected = range ?? periodRange(period, today);
  // balances are a small table; reading them with the card list costs no extra round trip
  const [widgets, allBalances] = await Promise.all([s.widgets(page), s.balances()]);
  if (widgets.length === 0) {
    return (
      <div className="tile empty">
        Nothing on this page yet. Ask your AI agent to add a card, for example “add a chart of eating out by month to {page === "home" ? "Home" : "Plan"}”.
      </div>
    );
  }
  const has = (...types: string[]) => widgets.some((w) => types.includes(w.type));
  const goals = s.buckets.filter((b) => (b.kind === "goal" || b.kind === "saving") && (b.target_cents || b.archived));
  const end = [selected.end, thisMonth(today).end].sort().at(-1)!;
  // cards that show today's balances need every transaction since each account's last recorded balance
  const needsSince = has("summary", "balances", "forecast", "upcoming", "net_worth", "goals");
  const lastBalance = new Map<string, string>();
  for (const b of allBalances) if ((lastBalance.get(b.account_id) ?? "") < b.date) lastBalance.set(b.account_id, b.date);
  const since = needsSince && lastBalance.size ? [...lastBalance.values()].sort()[0] : null;
  const wanted = startNeeded(widgets, selected, today);
  const start = since && wanted !== null && since < wanted ? since : wanted;
  // Codex reads the whole household as of today, so its card shows only when the page does too
  const wantsAi = live && has("ai") && !narrows(filter);
  const [loaded, budgets, txs, goalLines, owed, ai, rules] = await Promise.all([
    s.lines(start, end),
    has("budgets", "summary", "insights", "outlook", "pace") ? s.budgets() : [],
    has("recent", "review", "summary") ? s.transactions(300, live ? undefined : selected) : [],
    has("goals") ? s.linesOf(goals.map((g) => g.id)) : [],
    has("owed") ? s.owed() : [],
    wantsAi && s.ai ? s.ai() : null,
    s.monthRules?.() ?? [],
  ]);
  const balances = allBalances;
  // the page's own filters (Analysis) narrow every card; balances and goals are never filtered
  const narrow = (ls: Line[]) => filter ? ls.filter((l) => matchesLine(l, { ...filter, from: undefined, to: undefined }, { buckets: s.buckets, members: s.members })) : ls;
  // rent sent early and pay that arrives ahead count in the month they're for, on every card
  const lines = narrow(countedLines(loaded, rules));
  // a budget that rolls over needs the year before the month on screen; read only when one does
  const carryFrom = selected.key === "month" && selected.start && budgets.some((b) => b.attrs?.rollover === true) ? isoDate(new Date(parseIso(selected.start).getFullYear(), parseIso(selected.start).getMonth() - 12, 1)) : null;
  const carryLines = !carryFrom ? [] : start !== null && start <= carryFrom ? lines : narrow(countedLines(await s.lines(carryFrom, selected.start!), rules));
  const asOf = isoDate(today);
  // today's balances read every loaded line, not the filtered ones: a filter or a past period never changes what's in the bank
  const now = currentBalances({ lines: loaded.filter((l) => l.date <= asOf), accounts: s.accounts, balances: balances.filter((b) => b.date <= asOf) });
  const ctx: Ctx = { now, s, selected, today, live, forced: !!range, privateBalances: (await cookies()).get("nl_private")?.value === "1", lines, budgets, carryLines, txs, goalLines, balances: live ? balances : balances.filter((b) => b.date <= asOf), owed, ai, zone: await getZone() };
  // a few days before a regular bill, Home says so once, above the cards; it goes when the charge lands
  // bills are spotted from the last four months, which Home already reads for its insights
  const soon = page === "home" && live && !filter && (start === null || start <= monthsBack(today, 4)) ? dueSoon(recurring(lines, today), today) : [];
  return (
    <>
      {soon.length > 0 && <DueSoonNote soon={soon} />}
      <div className="board">{widgets.map((w) => <WidgetCard key={w.id} w={w} ctx={ctx} />)}</div>
    </>
  );
}

/**
 * "Amazon Prime usually comes out on Sun, Nov 1, about $5.59." These are charges that take themselves, on a day
 * worked out from past months, so the note says what usually happens rather than that something is owed.
 */
function DueSoonNote({ soon }: { soon: ReturnType<typeof dueSoon> }) {
  const when = (s: (typeof soon)[number]) => s.days === 0 ? "today" : s.days === 1 ? "tomorrow"
    : `on ${parseIso(s.date).toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric" })}`;
  return (
    <section className="due-soon" aria-label="Bills due soon">
      <Bell size={18} strokeWidth={1.75} aria-hidden className="due-soon-icon" />
      <ul>
        {soon.slice(0, 3).map((s) => (
          <li key={s.merchant}><strong>{tidyMerchant(s.merchant)}</strong> usually comes out {when(s)}, about <span className="nl-amt">{money(s.amount)}</span>.</li>
        ))}
      </ul>
    </section>
  );
}

/** True when a filter keeps only some lines (a bucket, an account, words, amounts…), not just a stretch of dates. */
export const narrows = (f?: Slice) => !!f && !!(f.text.length || f.buckets.length || f.accounts.length || f.people.length
  || f.kinds.length || f.flags.length || f.min != null || f.max != null);

function WidgetCard({ w, ctx }: { w: Widget; ctx: Ctx }) {
  const spec = specOf(w);
  const span = ["full", "wide", "half", "third"].includes(spec.span ?? "") ? spec.span! : DEFAULT_SPAN[w.type] ?? "half";
  if (w.type === "summary") return <Summary id={`card-${w.id}`} spec={spec} ctx={ctx} />;
  // no recent run (or a past period on screen): the card steps aside rather than show stale notes
  if (w.type === "ai" && !ctx.ai) return null;
  const title = w.title ?? defaultTitle(w.type, spec, ctx);
  const head = headOf(w.type, spec, ctx);
  // on Analysis the insights sit under the page's own "Insights" heading, so their box has no title of its own
  const bare = ctx.forced && w.type === "outlook";
  return (
    <section className={`tile span-${span}`} id={`card-${w.id}`} {...(bare ? { "aria-label": title } : { "aria-labelledby": `w-${w.id}` })}>
      {!bare && <header className="tile-head">
        <div>
          <h2 className="heading" id={`w-${w.id}`}>{title}</h2>
          {head.caption && <p className="caption">{head.caption}</p>}
        </div>
        <div className="tile-tools">
          {head.link && <Link href={head.link.href} scroll={head.link.href.startsWith("/budgets/new") ? false : undefined} className="textlink">{head.link.label}</Link>}
        </div>
      </header>}
      {w.type === "stat" ? <Stat spec={spec} ctx={ctx} />
        : w.type === "insights" ? <Insights ctx={ctx} />
        : w.type === "ai" ? <AiInsights ai={ctx.ai!} />
        : w.type === "outlook" ? <Outlook ctx={ctx} />
        : w.type === "savings_rate" ? <SavingsRate spec={spec} ctx={ctx} />
        : w.type === "matrix" ? <BucketMatrix spec={spec} ctx={ctx} />
        : w.type === "bills" ? <Bills ctx={ctx} />
        : w.type === "forecast" ? <Forecast ctx={ctx} />
        : w.type === "upcoming" ? <Upcoming ctx={ctx} />
        : w.type === "balances" ? <Balances ctx={ctx} />
        : w.type === "debts" ? <Debts spec={spec} ctx={ctx} />
        : w.type === "owed" ? <Owed ctx={ctx} />
        : w.type === "transfers" ? <Transfers spec={spec} ctx={ctx} />
        : w.type === "pace" ? <Pace ctx={ctx} />
        : w.type === "bars" ? <Bars spec={spec} ctx={ctx} />
        : w.type === "compare" ? <Compare spec={spec} ctx={ctx} />
        : w.type === "share" ? <Share spec={spec} ctx={ctx} />
        : w.type === "trend" ? <Trend spec={spec} ctx={ctx} />
        : w.type === "cashflow" ? <Cashflow spec={spec} ctx={ctx} />
        : w.type === "calendar" ? <Calendar ctx={ctx} />
        : w.type === "weekday" ? <Weekday ctx={ctx} />
        : w.type === "merchants" ? <Merchants spec={spec} ctx={ctx} />
        : w.type === "budgets" ? <Budgets spec={spec} ctx={ctx} />
        : w.type === "goals" ? <Goals ctx={ctx} />
        : w.type === "net_worth" ? <NetWorth ctx={ctx} />
        : w.type === "recent" ? <Recent spec={spec} ctx={ctx} />
        : w.type === "review" ? <Recent spec={spec} ctx={ctx} review />
        : w.type === "week" ? <Week ctx={ctx} />
        : w.type === "view" ? <ViewTable spec={spec} ctx={ctx} />
        : <p className="empty">This card’s type, “{w.type}”, isn’t one the app can draw yet. It can be one of: {KNOWN.join(", ")}.</p>}
    </section>
  );
}

function defaultTitle(type: string, spec: Spec, ctx: Ctx) {
  const measure = MEASURE_LABEL[spec.measure ?? "spend"] ?? spec.measure;
  const cmp = comparison(rangeOf(spec, ctx), ctx.today);
  return ({
    stat: measure, bars: `${measure} by ${(spec.group_by ?? "bucket").replace("_", " ")}`, trend: `${measure} by month`,
    insights: "Worth knowing", ai: "AI Insights", outlook: "Insights", pace: "Spending pace", compare: cmp ? `Compared with ${cmp.label}` : "Compared with before",
    share: spec.measure === "income" ? "Where it comes from" : "Where it goes", savings_rate: "Share of income kept",
    matrix: "Every bucket, month by month", bills: "Regular bills", forecast: "End of the month", balances: "Balances", upcoming: "Coming up", debts: "Debt-free plan",
    owed: "Money owed", transfers: "Moved between accounts", cashflow: "Money in and out", calendar: "Day by day", weekday: "By day of the week",
    merchants: "Top places", budgets: "Budgets", goals: "Goals", net_worth: "Net worth", recent: "Recent",
    review: "Needs a look", view: spec.view ?? "View",
  } as Record<string, string>)[type] ?? type;
}

/** "Nov 2025 to Oct 2026, by month" for the months a chart shows. */
/** A long stretch reads in quarters, and past five years in years, so the columns stay wide enough to read. */
const sumOf = (ms: string[], value: (m: string) => number) => ms.reduce((t, m) => t + value(m), 0);
const unitOf = (months: string[]) => (months.length > 60 ? "year" : months.length > 18 ? "quarter" : "month");

/** The chart columns for these months: one per month, quarter or year (see `unitOf`), with the months each one sums. */
function columnsOf(months: string[]) {
  const unit = unitOf(months);
  if (unit === "month") return months.map((m, i) => ({ key: m, months: [m], ...tick(m, i), long: monthLabel(m, { month: "long", year: "numeric" }) }));
  const groups = new Map<string, string[]>();
  for (const m of months) {
    const y = m.slice(0, 4), q = `Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;
    const key = unit === "year" ? y : `${y}-${q}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups].map(([key, ms], i) => {
    const [y, q] = key.split("-"), yy = `'${y.slice(2)}`;
    return unit === "year" ? { key, months: ms, label: y, short: yy, long: y }
      : { key, months: ms, label: i === 0 || q === "Q1" ? `${q} ${yy}` : q, short: q, long: `${q} ${y}` };
  });
}

const monthsCaption = (months: string[]) => {
  // fixed three letters: some locales write "Sept."
  const name = (m: string) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  return `${name(months[0])} to ${name(months.at(-1)!)}, by ${unitOf(months)}`;
};

/** The small line under a card title: which stretch of time it covers, plus an optional link. */
function headOf(type: string, spec: Spec, ctx: Ctx): { caption?: string; link?: { href: string; label: string } } {
  const range = rangeOf(spec, ctx);
  const months = monthsOf(spec, ctx.today);
  const cmp = comparison(range, ctx.today);
  switch (type) {
    case "pace": return { caption: ctx.selected.key === "all" ? thisMonth(ctx.today).label : ctx.selected.label };
    case "calendar": return { caption: thisMonth(ctx.today).label };
    case "trend": return { caption: `Last ${months.length} months` };
    case "cashflow": case "savings_rate": return { caption: monthsCaption(monthsFor(spec, ctx, type)) };
    case "matrix": return { caption: `Last ${monthsOf(spec, ctx.today, type).length} months` };
    case "bills": return { caption: `${thisMonth(ctx.today).label} · charges that come back every month` };
    case "outlook": return { caption: ctx.forced ? `${ctx.selected.label}, and the 12 months up to its end` : "The last 12 full months" };
    case "forecast": return { caption: `${thisMonth(ctx.today).label}, estimated from today` };
    case "debts": return { caption: spec.method === "snowball" ? "Smallest balance first" : "Highest interest first" };
    case "owed": return { caption: "Still open" };
    case "upcoming": return { caption: `Rest of ${thisMonth(ctx.today).label}` };
    case "balances": return { caption: "Right now" };
    case "weekday": return { caption: "Average per day, last 12 weeks" };
    case "compare": return { caption: cmp ? `${range.label} so far, against the same days ${cmp.label}` : undefined };
    case "recent": return { link: { href: "/transactions", label: "See all" } };
    case "week": return { caption: "Against the 7 days before" };
    case "review": return { link: { href: "/transactions?view=review", label: "See all" } };
    // with none yet, the card's own button asks instead
    case "budgets": return { caption: range.label, link: budgetRows(ctx, range).length ? { href: "/budgets/new", label: "Add budget" } : undefined };
    case "ai": return { caption: ctx.ai ? writtenAt(ctx.ai.generatedAt, ctx.today, ctx.zone) : undefined };
    case "goals": case "net_worth": case "view": case "insights": return {};
    default: return { caption: range.label };
  }
}

const linesFor = (spec: Spec, ctx: Ctx, range = rangeOf(spec, ctx)) =>
  applyFilter(ctx.lines.filter((l) => inRange(l.date, range)), spec.filter, ctx.s.buckets);

/** Budget rows for the top-level spend buckets that have one in this range. */
function budgetRows(ctx: Ctx, range: Range) {
  const inPeriod = ctx.lines.filter((l) => inRange(l.date, range));
  return ctx.s.buckets
    .filter((b) => !b.archived && !b.parent_id)
    .map((b) => ({ b, budget: budgetFor(ctx.budgets, b.id, range) }))
    .filter((r): r is { b: typeof r.b; budget: number } => r.budget !== null && r.budget > 0)
    .map(({ b, budget }) => {
      const ids = bucketsUnder([b.name], ctx.s.buckets);
      const mine = (l: Line) => !!l.bucket_id && ids.has(l.bucket_id);
      // rollover: last months' leftover (or overspending) comes into this month's budget
      const carry = range.key === "month" && range.start
        ? carryInto(ctx.budgets, b.id, range.start, (st, en) => sumMeasure(ctx.carryLines.filter((l) => l.date >= st && l.date < en && mine(l)), "spend")) : 0;
      return { b, budget: budget + carry, carry, spent: sumMeasure(inPeriod.filter(mine), "spend") };
    });
}

function Summary({ id, spec, ctx }: { id: string; spec: Spec; ctx: Ctx }) {
  const range = rangeOf(spec, ctx);
  const lines = linesFor(spec, ctx, range);
  const spent = sumMeasure(lines, "spend"), income = sumMeasure(lines, "income"), kept = income - spent;
  const found = comparison(range, ctx.today);
  const cmp = found && covers(ctx.lines, found) ? found : null;
  const before = cmp ? sumMeasure(ctx.lines.filter((l) => inRange(l.date, cmp.before)), "spend") : 0;
  const delta = cmp && before > 0 ? sumMeasure(ctx.lines.filter((l) => inRange(l.date, cmp.now)), "spend") - before : null;
  const rows = budgetRows(ctx, range);
  const left = rows.reduce((s, r) => s + (r.budget - r.spent), 0);
  const review = ctx.txs.filter(needsLook).length;
  const isNow = ctx.live && range.start && inRange(isoDate(ctx.today), range);
  const elapsed = isNow && range.key === "month" ? ctx.today.getDate() : null;
  const days = new Date(ctx.today.getFullYear(), ctx.today.getMonth() + 1, 0).getDate();
  // what's left in the budgets, spread over the days that remain (today included)
  const daysLeft = elapsed ? days - elapsed + 1 : 0;
  const perDay = daysLeft && left > 0 ? Math.floor(left / daysLeft) : null;
  const whole = (c: number) => formatCents(Math.round(c / 100) * 100, { sign: false, trim: true });
  // today's money: what's in the bank accounts and what the cards owe, the same whichever period is shown
  const now = ctx.now;
  const cash = now.some((r) => !r.is_debt) ? now.filter((r) => !r.is_debt).reduce((s, r) => s + r.balance, 0) : null;
  const owedCards = now.filter((r) => r.is_debt && r.kind === "credit_card").reduce((s, r) => s + Math.max(r.balance, 0), 0);
  return (
    <section className={`summary span-full${cash !== null ? " has-balance" : ""}`} id={id} aria-label={`${range.label} summary`}>
      {cash !== null && (
        <div className="summary-balance">
          <div className="summary-balance-head">
            <span className="summary-label">{ctx.live ? "In your accounts" : "In your accounts today"}</span>
            <PrivacyToggle hidden={ctx.privateBalances} />
          </div>
          <p className="summary-cash"><Private className="nl-amt">{money(cash)}</Private></p>
          {owedCards > 0 && <span className="summary-note">Cards owe <Private className="nl-amt">{money(owedCards)}</Private></span>}
        </div>
      )}
      <p className="summary-label">{range.label}{elapsed ? `, day ${elapsed} of ${days}` : ""}</p>
      <h2 className="summary-line">
        <Link href={listHref(`income ${datesQuery(range)}`, `Money in, ${range.label}`)} scroll={false} className="num-link nl-amt">{whole(income)}</Link> in,{" "}
        <Link href={listHref(`spending ${datesQuery(range)}`, `Spent, ${range.label}`)} scroll={false} className="num-link nl-amt">{whole(spent)}</Link> out.{" "}
        <span className={kept >= 0 ? "summary-kept" : "summary-short"}>
          {kept >= 0 ? <><span className="nl-amt">{whole(kept)}</span> kept.</> : <><span className="nl-amt">{whole(-kept)}</span> more went out.</>}
        </span>
      </h2>
      {elapsed && (
        <div className="summary-days" role="img" aria-label={`${elapsed} of ${days} days gone`}>
          <span style={{ width: `${(elapsed / days) * 100}%` }} />
        </div>
      )}
      <dl className="summary-stats">

        {delta !== null && cmp && !ctx.live && (
          <div>
            <dt>Against {cmp.label}</dt>
            <dd className={`summary-delta ${delta > 0 ? "up" : "down"}`}>
              {delta > 0 ? <TrendingUp size={16} strokeWidth={2} aria-hidden /> : <TrendingDown size={16} strokeWidth={2} aria-hidden />}
              <span className="nl-amt">{compact(Math.abs(delta))}</span> {delta > 0 ? "more" : "less"} spent
            </dd>
          </div>
        )}
        {rows.length > 0 && (
          <div><dt>{left >= 0 ? "Left in budgets" : "Over budgets"}</dt><dd className="nl-amt">{money(Math.abs(left))}</dd></div>
        )}
        {perDay !== null && (
          <div>
            <dt>Can spend a day</dt>
            <dd><span className="nl-amt">{money(perDay)}</span> <span className="summary-note">for {daysLeft} {daysLeft === 1 ? "day" : "days"}</span></dd>
          </div>
        )}
        {review > 0 && (
          <div>
            <dt>Needs a look</dt>
            <dd>
              <Link href={listHref("review", "Needs a look")} scroll={false} className="summary-review">
                {review} {review === 1 ? "transaction" : "transactions"} <ArrowRight {...iconProps} size={16} />
              </Link>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Stat({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const range = rangeOf(spec, ctx);
  const measure = spec.measure ?? "spend";
  const value = sumMeasure(linesFor(spec, ctx, range), measure);
  const found = comparison(range, ctx.today);
  const cmp = found && covers(ctx.lines, found) ? found : null;
  const before = cmp ? sumMeasure(applyFilter(ctx.lines.filter((l) => inRange(l.date, cmp.before)), spec.filter, ctx.s.buckets), measure) : null;
  return (
    <div className="stat">
      <span className="stat-value">{formatCents(value, { sign: measure === "net" || measure === "total" })}</span>
      {before !== null && cmp && <span className="caption">{formatCents(before, { sign: false })} at this point {cmp.label}</span>}
    </div>
  );
}

function Insights({ ctx }: { ctx: Ctx }) {
  const items = buildInsights({
    lines: ctx.lines, range: ctx.selected, today: ctx.today, budgets: ctx.budgets, buckets: ctx.s.buckets,
  }).slice(0, 6);
  if (items.length === 0) return <p className="empty">Nothing to point out yet. Insights appear once there are a few weeks of transactions.</p>;
  return <InsightList items={items} />;
}

/** What stands out in the chosen dates, then over the year up to their end: up to 20, in two columns when the card is wide. */
function Outlook({ ctx }: { ctx: Ctx }) {
  const now = buildInsights({ lines: ctx.lines, range: ctx.selected, today: ctx.today, budgets: ctx.budgets, buckets: ctx.s.buckets });
  const year = buildOutlook({ lines: ctx.lines, today: ctx.today, netWorth: netWorthNow(ctx)?.net ?? null });
  const items = [...now.slice(0, 6), ...year, ...now.slice(6)].filter((i, n, all) => all.findIndex((j) => j.text === i.text) === n).slice(0, 20);
  if (items.length === 0) return <p className="empty">Nothing to point out yet. Insights appear once there are a few weeks of transactions.</p>;
  return <InsightList items={items} columns />;
}

/** Codex's morning read: a short summary, then four to six notes (patterns fill in when there are few). Every number came from the app. */
function AiInsights({ ai }: { ai: AiRead }) {
  const notes = ai.insights.slice(0, 6);
  const extra = ai.patterns.slice(0, Math.max(0, 4 - notes.length));
  return (
    <>
      {ai.summary && <p className="ai-summary">{ai.summary}</p>}
      <ul className="insights insights-2">
        {notes.map((i) => (
          <li key={i.text} className={`insight ${i.tone}`}>
            <span className="insight-icon"><IconByName name={i.icon} size={16} /></span>
            <span>{i.text}</span>
          </li>
        ))}
        {extra.map((p) => (
          <li key={p.title} className="insight info">
            <span className="insight-icon"><IconByName name={p.icon} size={16} /></span>
            <span><strong className="insight-title">{p.title}.</strong> {p.detail}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Written this morning at 7:02 a.m.", "… yesterday at …" or "… on Monday at …", on the viewer's clock. */
function writtenAt(at: string, today: Date, zone: string) {
  const when = new Date(at);
  // en-CA here only to read the date as 2026-10-26 and the hour as a plain number; what is shown uses LOCALE
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(when));
  const ago = Math.round((parseIso(isoDate(today)).getTime() - parseIso(day).getTime()) / 86_400_000);
  const name = ago === 0 ? (hour < 12 ? "this morning" : "today") : ago === 1 ? "yesterday"
    : `on ${when.toLocaleDateString(LOCALE, { timeZone: zone, weekday: "long" })}`;
  return `Written ${name} at ${when.toLocaleTimeString(LOCALE, { timeZone: zone, hour: "numeric", minute: "2-digit" })}`;
}

function InsightList({ items, columns }: { items: Insight[]; columns?: boolean }) {
  return (
    <ul className={`insights${columns ? " insights-2" : ""}`}>
      {items.map((i) => (
        <li key={i.text} className={`insight ${i.tone}`}>
          <span className="insight-icon"><IconByName name={i.icon} size={16} /></span>
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Running total of spending through the selected period (a month, a quarter or a year) against the period
 * before it, with the budget for the period as a line.
 */
function Pace({ ctx }: { ctx: Ctx }) {
  const range = ctx.selected.key === "all" ? thisMonth(ctx.today) : ctx.selected;
  const cmp = comparison(range, ctx.today);
  const prev = cmp ? { start: cmp.before.start, end: isoDate(new Date(new Date(`${range.start}T12:00`).getTime())) } : null;
  const tomorrow = isoDate(new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate() + 1));
  const series = cumulativeRange(ctx.lines, range.start!, range.end, tomorrow);
  const before = prev ? cumulativeRange(ctx.lines, prev.start, range.start!) : [];
  const days = cumulativeRange([], range.start!, range.end).length;
  const budget = budgetRows(ctx, range).reduce((s, r) => s + r.budget, 0);
  if (!series.at(-1) && !before.at(-1)) return <p className="empty">No spending yet in {range.label}.</p>;
  const prevLabel = range.key === "year" ? String(Number(range.label) - 1) : range.key === "quarter"
    ? periodRange("quarter", new Date(`${prev!.start}T12:00`)).label : monthLabel(prev!.start, { month: "long" });
  const nowLabel = range.key === "month" ? monthLabel(range.start!, { month: "long" }) : range.label;
  const mid = new Date(new Date(`${range.start}T12:00`).getTime() + (days / 2) * 86_400_000);
  const axis = range.key === "month" ? undefined : [monthLabel(range.start!), monthLabel(isoDate(mid)), monthLabel(isoDate(new Date(new Date(`${range.end}T12:00`).getTime() - 86_400_000)))];
  return (
    <PaceChart now={series} before={before} days={days} budget={budget || undefined} today={series.length} axis={axis}
      labels={{ now: nowLabel, before: prevLabel }} />
  );
}

function groupColor(ctx: Ctx, groupBy: string, key: string, bucketId: string | null) {
  const b = bucketId ? ctx.s.buckets.find((x) => x.id === bucketId)
    : groupBy === "top_bucket" ? ctx.s.buckets.find((x) => !x.parent_id && x.name === key) : undefined;
  return { bucket: b, color: b ? bucketColor(b.color, b.id) : key === "Uncategorized" ? "var(--cat-8)" : bucketColor(null, key) };
}

function groupLabel(groupBy: string, key: string) {
  return groupBy === "month" ? monthLabel(key, { month: "short", year: "numeric" }) : key;
}

function Bars({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const groupBy = spec.group_by ?? "bucket";
  const measure = spec.measure ?? "spend";
  const groups = groupLines(linesFor(spec, ctx), groupBy, measure);
  const top = Number(spec.top) || 8;
  const shown = groups.slice(0, top);
  const total = groups.reduce((s, g) => s + g.value, 0);
  const biggest = Math.max(...shown.map((g) => Math.abs(g.value)), 1);
  if (shown.length === 0) return <p className="empty">Nothing here for {rangeOf(spec, ctx).label}.</p>;
  const rest = groups.slice(top);
  return (
    <>
      <ul className="hbars">
        {shown.map((g, i) => {
          const { bucket, color } = groupColor(ctx, groupBy, g.key, g.bucketId);
          return (
            <li key={g.key} className="hbar">
              <span className="hbar-name">
                {bucket ? <BucketIcon icon={bucket.icon} color={bucket.color} seed={bucket.id} small /> : <span className="hbar-dot" style={{ background: color }} />}
                <span className="hbar-label">{groupLabel(groupBy, g.key)}</span>
              </span>
              <span className="hbar-value">
                <span className="nl-amt">{money(Math.abs(g.value))}</span>
                {total > 0 && <span className="hbar-share">{Math.round((g.value / total) * 100)}%</span>}
              </span>
              <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(Math.abs(g.value) / biggest) * 100}%`, background: color, "--i": i } as React.CSSProperties} /></span>
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <p className="tile-foot caption">
          Plus {rest.map((g) => groupLabel(groupBy, g.key)).slice(0, 3).join(", ")}{rest.length > 3 ? ` and ${rest.length - 3} more` : ""}: {money(rest.reduce((s, g) => s + Math.abs(g.value), 0))}
        </p>
      )}
    </>
  );
}

/** Diverging bars: which buckets moved, and which way. Warm = spent more, cool = spent less. */
function Compare({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const cmp = comparison(rangeOf(spec, ctx), ctx.today);
  if (!cmp) return <p className="empty">Pick Month, Quarter or Year to compare.</p>;
  if (!covers(ctx.lines, cmp)) return <p className="empty">Not enough history yet to compare with {cmp.label}.</p>;
  const rows = changes(applyFilter(ctx.lines, spec.filter, ctx.s.buckets), cmp).slice(0, Number(spec.top) || 6);
  if (rows.length === 0) return <p className="empty">Spending looks just like {cmp.label}.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 1);
  return (
    <figure className="cmp-figure">
      <Legend items={[{ label: `More than ${cmp.label}`, color: "var(--div-more)" }, { label: `Less than ${cmp.label}`, color: "var(--div-less)" }]} />
      <ul className="cmp">
        {rows.map((r, i) => {
          const tip = `${r.key}: ${money(r.now)} now, ${money(r.before)} ${cmp.label}`;
          return (
            <li key={r.key} className={`cmp-row ${r.delta > 0 ? "more" : "less"}`} title={tip}>
              <span className="cmp-name">{r.key}</span>
              <span className="cmp-track" aria-hidden>
                <span className="cmp-bar" style={{ "--w": `${(Math.abs(r.delta) / max) * 50}%`, "--i": i } as React.CSSProperties} />
              </span>
              <span className="cmp-delta nl-amt">{r.delta > 0 ? "+" : "−"}{money(Math.abs(r.delta))}</span>
            </li>
          );
        })}
      </ul>
      <ChartTable caption={`Change by bucket compared with ${cmp.label}`} head={["Bucket", "Now", cmp.label, "Change"]}
        rows={rows.map((r) => [r.key, money(r.now), money(r.before), formatCents(r.delta)])} />
    </figure>
  );
}

/** Part of the whole: one strip, five biggest buckets plus everything else, each segment separated by a 2px gap. */
function Share({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const groups = groupLines(linesFor(spec, ctx), "top_bucket", spec.measure ?? "spend").filter((g) => g.value > 0);
  const total = groups.reduce((s, g) => s + g.value, 0);
  if (!total) return <p className="empty">{spec.measure === "income" ? "Nothing came in" : "Nothing spent"} in {rangeOf(spec, ctx).label}.</p>;
  const top = groups.slice(0, 5);
  const other = groups.slice(5).reduce((s, g) => s + g.value, 0);
  const used = new Set<string>();
  const distinct = (color: string) => {
    const pick = used.has(color) ? [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--cat-${n})`).find((c) => !used.has(c)) ?? color : color;
    used.add(pick);
    return pick;
  };
  const parts = [...top.map((g) => ({ key: g.key, value: g.value, color: distinct(groupColor(ctx, "top_bucket", g.key, null).color) })),
    ...(other ? [{ key: "Everything else", value: other, color: "var(--cat-8)" }] : [])];
  return (
    <figure className="share-figure">
      <div className="share" aria-hidden>
        {parts.map((p, i) => <span key={p.key} style={{ flexGrow: p.value, background: p.color, "--i": i } as React.CSSProperties} />)}
      </div>
      <ul className="share-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="legend-key bar" style={{ background: p.color }} aria-hidden />
            <span className="share-name">{p.key}</span>
            <span className="share-pct">{Math.round((p.value / total) * 100)}%</span>
            <span className="nl-amt share-amt">{money(p.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Trend({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const months = monthsOf(spec, ctx.today);
  const lines = applyFilter(ctx.lines, spec.filter, ctx.s.buckets);
  const measure = spec.measure ?? "spend";
  const values = months.map((m) => sumMeasure(lines.filter((l) => l.month === m), measure));
  const earlier = values.slice(0, -1);
  const average = earlier.length ? Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) : 0;
  const label = MEASURE_LABEL[measure] ?? measure;
  return (
    <Columns caption={`${label} by month`} color={measure === "income" ? "var(--series-income)" : "var(--series-spend)"}
      average={average ? { value: average, label: `Avg ${compact(average)}` } : undefined}
      items={months.map((m, i) => ({
        key: m, ...tick(m, i), value: Math.max(values[i], 0),
        tip: `${monthLabel(m, { month: "long", year: "numeric" })}\n${money(values[i])}`, strong: i === months.length - 1,
      }))} />
  );
}

function Cashflow({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const months = monthsFor(spec, ctx, "cashflow");
  const monthly = new Map(cashflow(applyFilter(ctx.lines, spec.filter, ctx.s.buckets), months).map((f) => [f.month, f]));
  const cols = columnsOf(months);
  const flow = cols.map((c) => ({ ...c, income: sumOf(c.months, (m) => monthly.get(m)!.income), spend: sumOf(c.months, (m) => monthly.get(m)!.spend) }));
  const kept = flow.reduce((s, f) => s + f.income - f.spend, 0);
  return (
    <>
      <PairedColumns caption={`Money in and out by ${unitOf(months)}`} head={unitOf(months)}
        items={flow.map((f, i) => ({ key: f.key, label: f.label, short: f.short, a: f.income, b: f.spend, strong: i === flow.length - 1,
          tip: `${f.long}\nIn ${money(f.income)}\nOut ${money(f.spend)}\nNet ${formatCents(f.income - f.spend)}` }))} />
      <p className="tile-foot caption">
        {kept >= 0 ? `Kept ${money(kept)} over these ${months.length} months.` : `${money(-kept)} more went out than came in over these ${months.length} months.`}
      </p>
    </>
  );
}

function SavingsRate({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const months = monthsFor(spec, ctx, "savings_rate");
  const monthly = new Map(savingsRates(applyFilter(ctx.lines, spec.filter, ctx.s.buckets), months).map((r) => [r.month, r]));
  const unit = unitOf(months);
  const raw = columnsOf(months).map((c) => {
    const kept = sumOf(c.months, (m) => monthly.get(m)!.kept), income = sumOf(c.months, (m) => monthly.get(m)!.income);
    return { ...c, kept, income, rate: income > 0 ? kept / income : null };
  });
  // a month with under a quarter of the usual income (or none) can't give a meaningful share
  const incomes = raw.map((r) => r.income).filter((v) => v > 0).sort((x, y) => x - y);
  const usual = incomes.length ? incomes[Math.floor((incomes.length - 1) / 2)] : 0;
  const rates = raw.map((r) => (r.income < usual * 0.25 ? { ...r, rate: null } : r));
  const done = rates.slice(0, -1).filter((r) => r.rate !== null);
  if (done.length === 0) return <p className="empty">This fills in once a month with income has been recorded.</p>;
  const average = done.reduce((s, r) => s + r.kept, 0) / Math.max(done.reduce((s, r) => s + r.income, 0), 1);
  const short = done.filter((r) => r.kept < 0).length;
  return (
    <>
      <SignedColumns caption={`Share of income kept by ${unit}`} head={unit[0].toUpperCase() + unit.slice(1)} average={average}
        items={rates.map((r, i) => ({
          key: r.key, label: r.label, short: r.short, value: r.rate, strong: i === rates.length - 1,
          tip: `${r.long}
${r.rate === null ? "Too little income recorded" : `${Math.round(r.rate * 100)}% kept (${formatCents(r.kept)})`}`,
        }))} />
      <p className="tile-foot caption">
        {average >= 0 ? `On average ${Math.round(average * 100)}% of income was kept` : "On average more went out than came in"}
        {short ? ` · ${short} ${short === 1 ? unit : `${unit}s`} went past income.` : ` · no ${unit} went past income.`}
      </p>
    </>
  );
}

function BucketMatrix({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const months = monthsOf(spec, ctx.today, "matrix");
  const rows = bucketMonths(applyFilter(ctx.lines, spec.filter, ctx.s.buckets), months, Number(spec.top) || 10);
  if (rows.length === 0) return <p className="empty">Nothing spent in the last {months.length} months.</p>;
  return (
    <>
      <Matrix current={thisMonth(ctx.today).start!} rows={rows}
        months={months.map((m) => ({ key: m, label: monthLabel(m), long: monthLabel(m, { month: "long", year: "numeric" }) }))} />
      <p className="tile-foot caption">Each row is shaded against its own busiest month. The average leaves out this month, which isn’t over yet.</p>
    </>
  );
}

/** Regular charges on a month line (filled dot = already paid), then the list. */
function Bills({ ctx }: { ctx: Ctx }) {
  const bills = recurring(ctx.lines, ctx.today);
  if (bills.length === 0) return <p className="empty">No regular bills spotted yet. They show up after three months of the same charge.</p>;
  const day = ctx.today.getDate();
  const days = new Date(ctx.today.getFullYear(), ctx.today.getMonth() + 1, 0).getDate();
  const month = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), 1).toLocaleDateString(LOCALE, { month: "short" });
  const due = bills.filter((b) => b.paid === null), paid = bills.filter((b) => b.paid !== null);
  const toCome = due.reduce((s, b) => s + b.amount, 0), paidSum = paid.reduce((s, b) => s + (b.paid ?? 0), 0);
  const at = (d: number) => `${((Math.min(d, days) - 1) / Math.max(days - 1, 1)) * 100}%`;
  return (
    <>
      <div className="bills-top">
        {toCome > 0
          ? <p className="stat"><span className="stat-value">{money(toCome)}</span><span className="caption">still to come · {money(paidSum)} paid so far</span></p>
          : <p className="stat"><span className="stat-value">All paid</span><span className="caption">{money(paidSum)} in regular bills, nothing left to come this month</span></p>}
        <ChartTip className="bill-line">
          <div className="bill-track" aria-hidden>
            <span className="bill-done" style={{ width: at(day) }} />
            {bills.map((b, i) => (
              <span key={b.merchant} className={`bill-dot${b.paid !== null ? " paid" : ""}`} style={{ left: at(b.day), "--i": i } as React.CSSProperties}
                data-tip={`${tidyMerchant(b.merchant)}
${b.paid !== null ? `Paid ${money(b.paid)}` : `About ${money(b.amount)} around ${month} ${b.day}`}`} />
            ))}
            <span className="bill-today" style={{ left: at(day) }} />
          </div>
          <div className="bill-axis"><span>{month} 1</span><span>{month} {days}</span></div>
        </ChartTip>
      </div>
      <BillList bills={[...due, ...paid]} shown={5} day={day} month={month} />
      {bills.length > 5 && <ShowMore count={bills.length - 5} />}
    </>
  );
}

function BillList({ bills, shown = Infinity, day, month }: { bills: ReturnType<typeof recurring>; shown?: number; day: number; month: string }) {
  return (
    <ul className="bills" data-more="less">
      {bills.map((b, i) => {
        const late = b.paid === null && b.day < day;
        return (
          <li key={b.merchant} className={b.paid !== null ? "paid" : ""} data-extra={i >= shown || undefined}>
            <span className="bill-day"><span>{month}</span>{b.paid !== null && b.paidOn ? Number(b.paidOn.slice(8, 10)) : b.day}</span>
            <Link href={listHref(`"${b.merchant.replace(/"/g, "")}"`, tidyMerchant(b.merchant))} scroll={false} className="bill-name" title={b.merchant}>{tidyMerchant(b.merchant)}<span className="caption">{b.bucket}</span></Link>
            <span className="bill-amt">
              <span className="nl-amt">{money(b.paid ?? b.amount)}</span>
              <span className={`bill-state${late ? " late" : ""}`}>
                {b.paid !== null ? <><Check size={12} strokeWidth={2.25} aria-hidden />Paid</> : late ? "Not seen yet" : "Coming"}
              </span>
            </span>
            <NotABill merchant={b.merchant} />
          </li>
        );
      })}
    </ul>
  );
}

/** Every account's balance now: the last recorded balance plus everything since. Money you have, then what you owe. */
function Balances({ ctx }: { ctx: Ctx }) {
  const rows = [...ctx.now];
  if (rows.length === 0) return <p className="empty">No balances yet. Tell your AI agent “Chequing is at {EXAMPLE_BALANCE} today” and every account shows here.</p>;
  const have = rows.filter((r) => !r.is_debt), owe = rows.filter((r) => r.is_debt && r.balance !== 0);
  const asOf = formatDate;
  const list = (items: typeof rows) => (
    <ul className="accounts">
      {items.sort((a, b) => b.balance - a.balance).map((r) => (
        <li key={r.id}>
          <span>{r.name}<span className="caption"> · {r.stale ? `from ${asOf(r.asOf)}` : `updated ${asOf(r.asOf)}`}</span></span>
          <Private className="nl-amt">{r.balance < 0 ? "−" : ""}{money(Math.abs(r.balance))}</Private>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="balances">
      <section>
        <h3 className="owed-head">In your accounts <Private className="nl-amt">{money(have.reduce((s, r) => s + r.balance, 0))}</Private></h3>
        {list(have)}
      </section>
      {owe.length > 0 && (
        <section>
          <h3 className="owed-head">Owed on cards and loans <Private className="nl-amt">{money(owe.reduce((s, r) => s + r.balance, 0))}</Private></h3>
          {list(owe)}
        </section>
      )}
    </div>
  );
}

/** What is still to come this month: the month-end estimate, then each regular bill not yet paid. */
function Upcoming({ ctx }: { ctx: Ctx }) {
  if (!ctx.live) return <p className="empty">This looks ahead from today, so it shows on the current month only.</p>;
  const f = forecastMonth({ lines: ctx.lines, today: ctx.today, accounts: ctx.s.accounts, balances: ctx.balances });
  const day = ctx.today.getDate();
  const month = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), 1).toLocaleDateString(LOCALE, { month: "short" });
  const due = recurring(ctx.lines, ctx.today).filter((b) => b.paid === null);
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      {f ? (
        <p className="stat"><span className="stat-value">{f.end < 0 ? "−" : ""}{money(Math.abs(f.end))}</span>
          <span className="caption">expected at month end: {money(Math.max(f.today, 0))} now, +{money(sum(f.income))} coming in, −{money(sum(f.bills) + f.everyday.total)} going out</span></p>
      ) : (
        <p className="caption">Add a balance for your bank accounts to see the month-end estimate.</p>
      )}
      {due.length ? <BillList bills={due.slice(0, 5)} day={day} month={month} /> : <p className="caption">Every regular bill is paid for {month}.</p>}
    </>
  );
}

/** Today's money, plus what is still coming in, minus what is still going out, gives a month-end estimate. */
function Forecast({ ctx }: { ctx: Ctx }) {
  if (!ctx.live) return <p className="empty">The forecast looks ahead from today, so it shows on the current month only.</p>;
  const f = forecastMonth({ lines: ctx.lines, today: ctx.today, accounts: ctx.s.accounts, balances: ctx.balances });
  if (!f) return <p className="empty">This needs a balance for your bank accounts and cards. Tell your AI agent “Chequing is at {EXAMPLE_BALANCE} today”.</p>;
  const asOf = formatDate(f.asOf);
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <p className="stat"><span className="stat-value">{f.end < 0 ? "−" : ""}{money(Math.abs(f.end))}</span>
        <span className="caption">in your everyday accounts at the end of the month, after card balances</span></p>
      <dl className="ledger">
        <div><dt>Today</dt><dd className="nl-amt">{formatCents(f.today)}</dd></div>
        <div><dt>Regular income to come</dt><dd className="nl-amt in">+{money(sum(f.income))}</dd></div>
        <div><dt>Regular bills to come</dt><dd className="nl-amt">−{money(sum(f.bills))}</dd></div>
        <div><dt>Everyday spending, {money(f.everyday.perDay)} a day for {f.everyday.days} {f.everyday.days === 1 ? "day" : "days"}</dt><dd className="nl-amt">−{money(f.everyday.total)}</dd></div>
      </dl>
      <p className="tile-foot caption">
        {f.stale ? `Some balances are older than the history loaded here (oldest ${asOf}). Update them for a closer estimate.` : `Balances as of ${asOf}, plus everything recorded since.`}
      </p>
    </>
  );
}

/** Debt-free date with the chosen method, and what an extra $100 a month would change. */
function Debts({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const latest = new Map<string, Balance>();
  for (const b of ctx.balances) latest.set(b.account_id, b);
  const owing = ctx.s.accounts.filter((a) => a.is_debt && !a.archived && (latest.get(a.id)?.balance_cents ?? 0) > 0);
  if (owing.length === 0) return <p className="empty">No debts with a balance. Nothing to plan.</p>;
  const ready = owing.filter((a) => typeof a.attrs?.apr === "number" && typeof a.attrs?.min_payment_cents === "number");
  const missing = owing.filter((a) => !ready.includes(a));
  if (ready.length === 0) {
    return <p className="empty">Add each card’s interest rate and minimum payment, for example tell your AI agent “the credit card charges 21.99% and the minimum is {formatCents(1000, { sign: false, trim: true })}”.</p>;
  }
  const method = spec.method === "snowball" ? "snowball" : "avalanche";
  const extra = Math.max(0, Number(spec.extra) || 0);
  const debts = ready.map((a) => ({ name: a.name, balance: latest.get(a.id)!.balance_cents, apr: a.attrs.apr as number, minimum: a.attrs.min_payment_cents as number }));
  const plan = payoffPlan(debts, extra, method);
  const more = payoffPlan(debts, extra + 10000, method);
  const when = (months: number) => new Date(ctx.today.getFullYear(), ctx.today.getMonth() + months, 1).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  return (
    <>
      {plan.months === null
        ? <p className="stat"><span className="stat-value">Not with minimums</span><span className="caption">The payments don’t cover the interest. Pay more than the minimum on the dearest card.</span></p>
        : <p className="stat"><span className="stat-value">{plan.months === 0 ? "Debt-free" : when(plan.months)}</span>
            <span className="caption">{money(debts.reduce((s, d) => s + d.balance, 0))} owed today, about {money(plan.interest)} in interest on the way{extra ? `, paying ${money(extra)} a month over the minimums` : ", paying the minimums"}</span></p>}
      <ol className="payoff">
        {debts.slice().sort((a, b) => (plan.order.find((o) => o.name === a.name)?.month ?? 999) - (plan.order.find((o) => o.name === b.name)?.month ?? 999)).map((d) => {
          const done = plan.order.find((o) => o.name === d.name);
          return (
            <li key={d.name}>
              <span className="payoff-name">{d.name}<span className="caption">{d.apr}% · {money(d.minimum)} minimum</span></span>
              <span className="payoff-right"><span className="nl-amt">{money(d.balance)}</span><span className="caption">{done ? `paid off ${when(done.month)}` : "not paid off"}</span></span>
            </li>
          );
        })}
      </ol>
      {more.months !== null && (plan.months === null || more.months < plan.months) && (
        <p className="tile-foot caption">
          Another $100 a month: debt-free by {when(more.months)}{plan.months !== null ? `, about ${money(Math.max(0, plan.interest - more.interest))} less interest` : ""}.
          {missing.length > 0 && ` ${missing.map((a) => a.name).join(" and ")} ${missing.length === 1 ? "has" : "have"} no interest rate yet, so ${missing.length === 1 ? "it isn’t" : "they aren’t"} counted.`}
        </p>
      )}
    </>
  );
}

function Owed({ ctx }: { ctx: Ctx }) {
  if (ctx.owed.length === 0) return <p className="empty">Nobody owes you anything, and you owe nobody. Open a transaction and choose “Someone owes us for this”, or tell your AI agent “Sam owes us {formatCents(4000, { sign: false, trim: true })} for dinner”.</p>;
  const theirs = ctx.owed.filter((r) => owedAmount(r) > 0), ours = ctx.owed.filter((r) => owedAmount(r) < 0);
  const since = formatDate;
  const list = (rows: OwedRow[]) => (
    <ul className="owed">
      {rows.map((r) => (
        <li key={`${r.person}:${r.currency ?? CURRENCY}`}>
          <span className="owed-name">{r.person}<span className="caption">since {since(r.since)}{r.items > 1 ? ` · ${r.items} items` : ""}{r.next_due ? ` · due ${since(r.next_due)}` : ""}</span></span>
          <span className="owed-right">
            <span className="nl-amt">{formatOwed(owedAmount(r), r.currency)}</span>
            <OwedActions person={r.person} amount={formatOwed(Math.abs(owedAmount(r)), r.currency)} reasons={r.reasons} currency={r.currency}
              theirs={owedAmount(r) > 0} demo={ctx.s.demo} />
          </span>
        </li>
      ))}
    </ul>
  );
  const total = owedTotals;
  return (
    <div className="owed-cols">
      {theirs.length > 0 && <section><h3 className="owed-head">Owed to you <span className="nl-amt">{total(theirs)}</span></h3>{list(theirs)}</section>}
      {ours.length > 0 && <section><h3 className="owed-head">You owe <span className="nl-amt">{total(ours)}</span></h3>{list(ours)}</section>}
    </div>
  );
}

/** Moves between our own accounts in the period: both sides joined by transfer_id, never counted as spending. */
function Transfers({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const range = rangeOf(spec, ctx);
  const inRangeLines = ctx.lines.filter((l) => inRange(l.date, range));
  const outs = inRangeLines.filter((l) => l.transfer_id && l.amount_cents < 0);
  const moves = outs.map((o) => ({ o, i: ctx.lines.find((l) => l.transfer_id === o.transfer_id && l.amount_cents > 0) }))
    .sort((a, b) => b.o.date.localeCompare(a.o.date));
  const unlinked = inRangeLines.filter((l) => !l.transfer_id && l.kind === "transfer").length;
  if (moves.length === 0) {
    return <p className="empty">No moves between your accounts in {range.label}.{unlinked ? ` ${unlinked} transfer lines aren’t paired yet; your AI agent can link the two sides.` : ""}</p>;
  }
  const total = moves.reduce((s, m) => s - m.o.amount_cents, 0);
  const pairs = new Map<string, number>();
  for (const m of moves) {
    const key = `${m.o.account} → ${m.i?.account ?? "?"}`;
    pairs.set(key, (pairs.get(key) ?? 0) - m.o.amount_cents);
  }
  return (
    <>
      <p className="stat"><span className="stat-value">{money(total)}</span><span className="caption">moved in {moves.length} {moves.length === 1 ? "transfer" : "transfers"}, not counted as spending</span></p>
      <ul className="owed">
        {[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(spec.top) || 6).map(([key, v]) => (
          <li key={key}><span className="owed-name">{key}</span><span className="nl-amt">{money(v)}</span></li>
        ))}
      </ul>
      {unlinked > 0 && <p className="tile-foot caption">{unlinked} more transfer {unlinked === 1 ? "line isn’t" : "lines aren’t"} paired yet. Your AI agent can link the two sides.</p>}
    </>
  );
}

function Calendar({ ctx }: { ctx: Ctx }) {
  const start = thisMonth(ctx.today).start!;
  const values = dailySpend(ctx.lines, start);
  const day = ctx.today.getDate();
  const quiet = values.slice(0, day).filter((v) => v <= 0).length;
  const busiest = values.slice(0, day).reduce((best, v, i) => (v > values[best] ? i : best), 0);
  return (
    <>
      <SpendCalendar monthStart={start} values={values} today={day} sprout={<Sprout className="cal-sprout" size={12} strokeWidth={2} aria-hidden />} />
      <p className="tile-foot caption">
        {quiet ? `${quiet} no-spend ${quiet === 1 ? "day" : "days"} so far` : "Something spent every day so far"}
        {values[busiest] > 0 && ` · biggest day ${new Date(`${start}T12:00`).toLocaleDateString(LOCALE, { month: "short" })} ${busiest + 1} (${money(values[busiest])})`}
      </p>
    </>
  );
}

function Weekday({ ctx }: { ctx: Ctx }) {
  const end = isoDate(new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate() + 1));
  const start = isoDate(new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate() - 7 * 12 + 1));
  const rows = weekdayAverages(ctx.lines, start, end);
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);
  return (
    <Columns caption="Average spending per weekday"
      items={rows.map((r) => ({ key: r.day, label: r.day.slice(0, 2), value: r.value, tip: `${r.day}: ${money(r.value)} a day on average`, strong: r.day === top.day }))} />
  );
}

function Merchants({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const rows = merchants(linesFor(spec, ctx)).slice(0, Number(spec.top) || 8);
  if (rows.length === 0) return <p className="empty">No spending in {rangeOf(spec, ctx).label}.</p>;
  const max = rows[0].total;
  return (
    <table className="places">
      <thead><tr><th scope="col">Place</th><th scope="col">Visits</th><th scope="col">Average</th><th scope="col">Total</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.merchant}>
            <th scope="row">
              <span className="places-name" title={r.merchant}>{tidyMerchant(r.merchant)}</span>
              <span className="places-track" aria-hidden><span style={{ width: `${(r.total / max) * 100}%`, "--i": i } as React.CSSProperties} /></span>
            </th>
            <td>{r.visits}</td>
            <td className="nl-amt">{compact(r.average)}</td>
            <td className="nl-amt">{money(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Budgets({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  const range = rangeOf(spec, ctx);
  const rows = budgetRows(ctx, range).sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  if (rows.length === 0) {
    return (
      <div className="empty empty-action">
        <p>No budgets yet. Give a bucket a monthly limit to see what’s left as the month goes.</p>
        <Link href="/budgets/new" scroll={false} className="nl-btn nl-btn-sm nl-btn-secondary">Add a budget</Link>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + r.budget, 0), used = rows.reduce((s, r) => s + r.spent, 0);
  const over = rows.filter((r) => r.spent > r.budget).length;
  const near = rows.filter((r) => r.spent <= r.budget && r.spent >= r.budget * 0.8).length;
  const limit = spec.limit === 0 ? rows.length : Number(spec.limit) || 5;
  const bar = ({ b, budget, spent, carry }: (typeof rows)[number], i: number) => (
    <BudgetBar key={b.id} name={b.name} icon={b.icon} color={b.color} seed={b.id} spent={spent} budget={budget} carry={carry}
      index={i < limit ? i : i - limit} extra={i >= limit}
      href={listHref(`${b.name} spending ${datesQuery(range)}`, `${b.name}, ${range.label}`)} />
  );
  return (
    <>
      <p className="budget-total">
        <span className="nl-amt">{money(Math.abs(total - used))}</span> {total - used >= 0 ? "left" : "over"} of {money(total)}
        {over > 0 && <span className="nl-badge nl-badge-over">{over} over</span>}
        {near > 0 && <span className="nl-badge nl-badge-review">{near} close</span>}
      </p>
      <div className="nl-budgets" data-more="less">{rows.map(bar)}</div>
      {rows.length > limit && <ShowMore count={rows.length - limit} />}
    </>
  );
}

function Goals({ ctx }: { ctx: Ctx }) {
  const all = ctx.s.buckets.filter((b) => (b.kind === "goal" || b.kind === "saving") && (b.target_cents || b.archived));
  const balances = new Map(currentBalances({ lines: ctx.lines.filter((l) => l.date <= isoDate(ctx.today)), accounts: ctx.s.accounts, balances: ctx.balances }).map((r) => [r.id, r.balance]));
  // progress: a linked account's balance, or attrs.saved_cents, or money moved into the goal (recorded as money out)
  const savedOf = (g: (typeof all)[number]) => {
    const account = typeof g.attrs?.account_id === "string" ? g.attrs.account_id : null;
    if (account && balances.has(account)) return Math.max(0, balances.get(account)!);
    if (typeof g.attrs?.saved_cents === "number") return Math.max(0, g.attrs.saved_cents);
    return Math.max(0, -ctx.goalLines.filter((l) => l.bucket_id === g.id).reduce((s, l) => s + l.amount_cents, 0));
  };
  const goals: GoalView[] = all.map((g) => {
    const saved = savedOf(g), target = g.target_cents ?? 0, done = target > 0 && saved >= target;
    let note = "";
    if (!done && g.target_date) {
      const due = new Date(`${g.target_date}T12:00`);
      const monthsLeft = Math.max(1, (due.getFullYear() - ctx.today.getFullYear()) * 12 + due.getMonth() - ctx.today.getMonth());
      note = `${money(Math.ceil((target - saved) / monthsLeft))} a month to make it by ${monthLabel(g.target_date, { month: "short", year: "numeric" })}`;
    }
    return {
      id: g.id, name: g.name, saved, target, note, reached: done, targetDate: g.target_date, archived: g.archived,
      accountId: typeof g.attrs?.account_id === "string" ? g.attrs.account_id : null,
      transactions: ctx.goalLines.filter((l) => l.bucket_id === g.id).length,
    };
  });
  const active = goals.filter((g) => !g.archived);
  return (
    <>
      {active.length > 0 && (
        <p className="budget-total"><span className="nl-amt">{money(active.reduce((s, g) => s + Math.min(g.saved, g.target), 0))}</span> saved toward {money(active.reduce((s, g) => s + g.target, 0))}</p>
      )}
      <GoalsCard goals={goals} accounts={ctx.s.accounts.filter((a) => !a.archived && !a.is_debt).map(({ id, name }) => ({ id, name }))} />
    </>
  );
}

/** Assets minus debts from each account's latest balance, or null when nothing has been recorded. */
function netWorthNow(ctx: Ctx) {
  const latest = new Map<string, Balance>();
  for (const b of ctx.balances) latest.set(b.account_id, b);
  const accounts = ctx.s.accounts.filter((a) => !a.archived && latest.has(a.id));
  if (accounts.length === 0) return null;
  const assets = accounts.filter((a) => !a.is_debt).reduce((s, a) => s + latest.get(a.id)!.balance_cents, 0);
  const debts = accounts.filter((a) => a.is_debt).reduce((s, a) => s + latest.get(a.id)!.balance_cents, 0);
  return { assets, debts, net: assets - debts };
}

function NetWorth({ ctx }: { ctx: Ctx }) {
  const history = ctx.balances;
  const current = new Map(currentBalances({ lines: ctx.lines.filter((l) => l.date <= isoDate(ctx.today)), accounts: ctx.s.accounts, balances: ctx.balances }).map((r) => [r.id, r]));
  const accounts = ctx.s.accounts.filter((a) => !a.archived);
  const latest = new Map<string, { date: string; balance_cents: number }>();
  for (const b of history) latest.set(b.account_id, b);
  // today's balance for each account (last recorded plus everything since), dated by the last record
  const rows = accounts.filter((a) => latest.has(a.id)).map((a) => ({ a, ...latest.get(a.id)!, balance_cents: current.get(a.id)?.balance ?? latest.get(a.id)!.balance_cents }));
  if (rows.length === 0) {
    return <p className="empty">No balances yet. Tell your AI agent “Chequing is at {EXAMPLE_BALANCE} today” and it records it.</p>;
  }
  const signed = (accountId: string, cents: number) => (accounts.find((a) => a.id === accountId)?.is_debt ? -cents : cents);
  const assets = rows.filter((r) => !r.a.is_debt).reduce((s, r) => s + r.balance_cents, 0);
  const debts = rows.filter((r) => r.a.is_debt).reduce((s, r) => s + r.balance_cents, 0);
  // net worth at the end of each month: the latest balance of every account up to that month
  const months = lastMonths(12, ctx.today);
  const series = months.map((m) => {
    const end = periodRange("month", new Date(`${m}T12:00`)).end;
    const last = new Map<string, number>();
    for (const b of history) if (b.date < end) last.set(b.account_id, signed(b.account_id, b.balance_cents));
    return { m, value: last.size ? [...last.values()].reduce((s, v) => s + v, 0) : null };
  }).filter((p): p is { m: string; value: number } => p.value !== null);
  const net = assets - debts;
  // the current month's column is today's net worth, not the last recorded one
  if (series.length && series.at(-1)!.m === months.at(-1)) series[series.length - 1] = { m: series.at(-1)!.m, value: net };
  return (
    <>
      <div className="stat">
        <Private className="stat-value">{net < 0 ? "−" : ""}{money(Math.abs(net))}</Private>
        <span className="caption"><Private>{money(assets)}</Private> owned · <Private>{money(debts)}</Private> owed</span>
      </div>
      <div className="nw-split">
        {series.length > 2 && (
          <Columns caption="Net worth by month" color="var(--series-income)"
            items={series.map((p, i) => ({ key: p.m, ...tick(p.m, i), value: Math.max(p.value, 0),
              tip: `${monthLabel(p.m, { month: "long", year: "numeric" })}\n${formatCents(p.value)}`, strong: i === series.length - 1 }))} />
        )}
        <ul className="accounts">
          {rows.map((r) => (
            <li key={r.a.id}>
              <span>{r.a.name}<span className="caption"> · {formatDate(r.date)}</span></span>
              <Private>{r.a.is_debt ? <Amount cents={-r.balance_cents} /> : <Amount cents={r.balance_cents} plain tone="neutral" />}</Private>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** The last 7 days (today included) against the 7 before: spending, and the top buckets that made it. */
function Week({ ctx }: { ctx: Ctx }) {
  const end = addDaysIso(isoDate(ctx.today), 1), start = addDaysIso(end, -7), before = addDaysIso(start, -7);
  const week = ctx.lines.filter((l) => l.date >= start && l.date < end), last = ctx.lines.filter((l) => l.date >= before && l.date < start);
  const spent = sumMeasure(week, "spend"), was = sumMeasure(last, "spend");
  const lastBy = new Map(groupLines(last, "top_bucket", "spend").map((g) => [g.key, g.value]));
  const top = groupLines(week, "top_bucket", "spend").filter((g) => g.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const span = (from: string, to: string) => `${parseIso(from).toLocaleDateString(LOCALE, { month: "short", day: "numeric" })} – ${parseIso(addDaysIso(to, -1)).toLocaleDateString(LOCALE, { month: "short", day: "numeric" })}`;
  const diff = spent - was;
  return (
    <>
      <p className="stat">
        <Link href={listHref(`spending ${start} to ${addDaysIso(end, -1)}`, `Spent, ${span(start, end)}`)} scroll={false} className="stat-value num-link nl-amt">{money(spent)}</Link>
        <span className="caption">
          spent {span(start, end)}
          {was > 0 && <> · {diff === 0 ? "the same as" : <><span className="nl-amt">{money(Math.abs(diff))}</span> {diff > 0 ? "more than" : "less than"}</>} the week before</>}
        </span>
      </p>
      {top.length === 0 ? <p className="empty">Nothing spent this week.</p> : (
        <ul className="week-list">
          {top.map((g) => {
            const b = ctx.s.buckets.find((x) => x.name === g.key && !x.parent_id);
            const prev = lastBy.get(g.key) ?? 0;
            return (
              <li key={g.key}>
                <Link href={listHref(`${g.key} spending ${start} to ${addDaysIso(end, -1)}`, `${g.key}, ${span(start, end)}`)} scroll={false} className="week-row">
                  <BucketIcon icon={b?.icon} color={b?.color} seed={b?.id ?? g.key} small />
                  <span className="week-name">{g.key}</span>
                  <span className="week-was caption">{prev > 0 ? `${money(prev)} before` : "new this week"}</span>
                  <span className="nl-amt">{money(g.value)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Recent({ spec, ctx, review }: { spec: Spec; ctx: Ctx; review?: boolean }) {
  const rows = (review ? ctx.txs.filter(needsLook) : ctx.txs).slice(0, Number(spec.limit) || 5);
  return (
    <TransactionList rows={rows} lookup={ctx.s} flush
      empty={review ? "All clear. Every transaction has a bucket." : "No transactions yet. Tap + to add your first one."} />
  );
}

async function ViewTable({ spec, ctx }: { spec: Spec; ctx: Ctx }) {
  if (!spec.view) return <p className="empty">This card needs the name of a database view in its settings.</p>;
  const { rows, error } = await ctx.s.view(spec.view, Number(spec.limit) || 20);
  if (error) return <p className="empty">Couldn’t read “{spec.view}”. Ask your AI agent to check that the view exists.</p>;
  if (rows.length === 0) return <p className="empty">“{spec.view}” has no rows yet.</p>;
  const columns = Object.keys(rows[0]).filter((c) => c !== "household_id" && !c.endsWith("_id") && c !== "id").slice(0, 6);
  const cell = (col: string, v: unknown) =>
    v == null ? "" : col.endsWith("_cents") && typeof v === "number" ? formatCents(v) : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <ChartTableInline columns={columns} rows={rows.map((r) => columns.map((c) => cell(c, r[c])))} />
  );
}

function ChartTableInline({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c.replace(/_cents$/, "").replaceAll("_", " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export { ChartTable };
