import { LOCALE } from "@/lib/format";
import { Suspense } from "react";
import { tidyMerchant } from "@/lib/merchant";
import { CalendarClock, ChevronDown, Flame, Leaf, Sparkles, TrendingUp } from "lucide-react";
import { Explorer, type SavedView, type ViewKey } from "./explorer";
import { compact, money } from "./charts";
import { BoardSkeleton } from "./skeleton";
import { WidgetBoard } from "./widgets";
import { asGroup, asMeasure, compareWindow, datesOf, windowOf, type ExploreLine, type Window } from "@/lib/explore";
import { periodRange, type PeriodKey } from "@/lib/dashboard";
import { matchesLine } from "@/lib/search";
import type { Option } from "./menu";
import { withLoadedLines, type DashboardSource } from "@/lib/dashboard-source";
import { incomeCalendar, oneOffs, priceCreep, seasonal, spikes } from "@/lib/insights";
import { addDaysIso, addMonths, isoDate, parseIso } from "@/lib/dates";
import { parseSearch } from "@/lib/search";
import { getToday } from "@/lib/today";

type Params = { q?: string; vs?: string; view?: string; g?: string; m?: string; s?: string; dir?: string };
const SORTS = ["label", "value", "share", "count", "average", "change"] as const;

/**
 * Analysis: one explorer whose filters and comparison drive the whole page, then the patterns in that data, then
 * insights and two monthly charts (the `analysis` page of the widgets table), all on the same dates and filters.
 */
export async function AnalysisPage({ source, params, saved }: { source: DashboardSource; params: Params; saved: SavedView[] | PromiseLike<SavedView[]> }) {
  const today = await getToday();
  const ctx = {
    buckets: source.buckets.filter((b) => !b.archived).map(({ id, name, parent_id, color, kind, icon }) => ({ id, name, parent_id, color, kind, icon })),
    accounts: source.accounts.map(({ id, name, institution }) => ({ id, name, institution })),
    members: source.members.map(({ user_id, display_name }) => ({ user_id, display_name })),
    userId: source.userId,
  };
  const q = params.q ?? "";
  const { slice } = parseSearch(q, { ...ctx, today });
  const a = windowOf(slice, today);

  // what kind of stretch the dates are, so "compared with" can offer the same kind earlier on
  const span = slice.from && slice.to && slice.from !== "1900-01-01" && slice.from.endsWith("-01") && slice.to.endsWith("-01")
    ? (parseIso(slice.to).getFullYear() - parseIso(slice.from).getFullYear()) * 12 + parseIso(slice.to).getMonth() - parseIso(slice.from).getMonth() : 0;
  const kind: PeriodKey | null = span === 1 ? "month" : span === 3 && (parseIso(slice.from!).getMonth() % 3 === 0) ? "quarter" : span === 12 && slice.from!.endsWith("-01-01") ? "year" : null;
  const vs = params.vs ?? "prev";
  let b: Window | null;
  // a custom comparison: "2026-01-01..2026-03-31", both days included
  const custom = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(vs);
  if (custom && a.from) {
    const [from, last] = [custom[1], custom[2]].sort();
    const w = { from, to: addDaysIso(last, 1) };
    b = { ...w, label: datesOf({ ...w, label: "" }) };
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(vs) && kind && a.from) {
    const r = periodRange(kind, parseIso(vs));
    // line the comparison up with the view: as many days in as the view has had so far
    const elapsed = Math.round((parseIso(a.to).getTime() - parseIso(a.from).getTime()) / 86_400_000);
    const full = r.end;
    const cut = isoDate(new Date(parseIso(r.start!).getTime() + elapsed * 86_400_000));
    b = { from: r.start, to: cut < full ? cut : full, label: r.label };
  } else {
    b = compareWindow(a, vs === "year" || vs === "years" ? "year" : vs === "none" ? "none" : "prev");
    if (b && vs !== "year" && vs !== "years" && kind) b = { ...b, label: kind === "month" ? periodRange("month", parseIso(b.from!)).label : kind === "quarter" ? periodRange("quarter", parseIso(b.from!)).label : String(parseIso(b.from!).getFullYear()) };
    if (b && (vs === "year" || vs === "years") && kind) b = { ...b, label: periodRange(kind, parseIso(b.from!)).label };
  }
  const vsOptions: Option[] = [
    { value: "prev", label: kind === "month" ? "The month before" : kind === "quarter" ? "The quarter before" : kind === "year" ? "The year before" : "The period before" },
    { value: "year", label: "Same time last year" },
    ...(a.from ? [{ value: "years", label: "Same time, every year" }] : []),
    { value: "none", label: "Nothing" },
  ];
  if (kind && a.from) {
    const first = source.earliest ?? addMonths(a.from, -36);
    for (let r = periodRange(kind, parseIso(addMonths(a.from, -span))); r.start && r.end > first && vsOptions.length < 40; r = periodRange(kind, parseIso(addMonths(r.start, -span)))) {
      vsOptions.push({ value: r.start, label: r.label, group: "Or pick one" });
    }
  }
  if (custom && b) vsOptions.push({ value: vs, label: b.label, group: "Pick dates" });
  vsOptions.push({ value: "custom", label: "Custom range…", group: "Pick dates" });

  // every year: the same dates in each year before last, as far back as the history fully covers them (up to five)
  const years: Window[] = [];
  if (vs === "years" && b?.from) {
    const first = source.earliest ?? b.from;
    for (let k = 2; k <= 6; k++) {
      const from = addMonths(a.from!, -12 * k), to = addMonths(a.to, -12 * k);
      if (from < addDaysIso(first, -31)) break;
      years.push({ from, to, label: yearsOf(from, to) });
    }
    b = { ...b, label: yearsOf(b.from, b.to) };
  }

  // one read covers the view, the comparison and two years of history for the patterns
  const twoYears = isoDate(new Date(today.getFullYear() - 2, today.getMonth(), 1));
  const from = a.from === null ? null : [a.from, b?.from, twoYears, years.at(-1)?.from].filter(Boolean).sort()[0]!;
  const until = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const [all, views] = await Promise.all([source.lines(from, a.to > until ? a.to : until), saved]);
  const lower = a.from === null ? null : [a.from, b?.from, years.at(-1)?.from].filter(Boolean).sort()[0]!;
  const upper = [a.to, b?.to].filter(Boolean).sort().at(-1)!;
  const lines: ExploreLine[] = all.filter((l) => (!lower || l.date >= lower) && l.date < upper).map((l) => ({
    date: l.date, merchant: l.merchant, amount_cents: l.amount_cents, bucket_id: l.bucket_id, bucket: l.bucket, top_bucket: l.top_bucket,
    kind: l.kind, account_id: l.account_id, account: l.account, person: l.person, transaction_id: l.transaction_id,
  }));
  // the same filters shape the patterns
  const filtered = all.filter((l) => matchesLine(l, { ...slice, from: undefined, to: undefined }, { buckets: source.buckets, members: source.members }));
  const sKey = SORTS.find((k) => k === params.s) ?? "value";
  // the cards read up to the last day of the chosen dates (today, unless the dates are in the past)
  const anchor = a.to < until ? parseIso(addDaysIso(a.to, -1)) : today;
  const view = (["breakdown", "mix", "time", "running", "heatmap"] as ViewKey[]).find((v) => v === params.view) ?? "breakdown";

  return (
    <>
      <header className="page-head"><h1 className="title">Analysis</h1></header>
      <Explorer today={isoDate(today)} earliest={source.earliest} lines={lines} a={a} b={b} years={years} vs={vs} vsOptions={vsOptions} ctx={ctx} saved={views}
        initial={{ q, g: asGroup(params.g), m: asMeasure(params.m), view, s: sKey, dir: params.dir === "asc" ? "asc" : "desc" }} />
      <PageSection id="patterns" title="Patterns">
        <Patterns lines={filtered} today={today} from={a.from ?? "1900-01-01"} to={a.to} label={a.label} />
      </PageSection>
      <PageSection id="insights" title="Insights">
        <Suspense fallback={<BoardSkeleton summary={false} />}>
          {/* the same dates and filters as the rest of the page: the year runs up to the end of the chosen dates */}
          <WidgetBoard source={withLoadedLines(source, all, from, a.to > until ? a.to : until)} page="analysis" period="month"
            today={anchor} live={anchor.getTime() === today.getTime()} filter={{ ...slice, from: undefined, to: undefined }}
            range={{ key: kind ?? "custom", start: a.from, end: a.to, label: a.label.replace(/ \(.*\)$/, ""), months: span || 12 }} />
        </Suspense>
      </PageSection>
    </>
  );
}

/** A year's name for a stretch of dates: "2025" inside one year, "2024–25" across two. */
function yearsOf(from: string, to: string): string {
  const y1 = from.slice(0, 4), y2 = addDaysIso(to, -1).slice(0, 4);
  return y1 === y2 ? y1 : `${y1}–${y2.slice(2)}`;
}

/** A page section with a heading and a short note. */
function PageSection({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="page-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="section-head">
        <div>
          <h2 className="section-title" id={`${id}-title`}>{title}</h2>
          {note && <p className="caption">{note}</p>}
        </div>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

type AnyLine = Parameters<typeof priceCreep>[0][number];

/**
 * Findings from the data as one quiet list: each row names the finding and its gist, and opens to the
 * detail. One open at a time. Only what the data clearly supports is shown.
 */
function Patterns({ lines, today, from, to, label }: { lines: AnyLine[]; today: Date; from: string; to: string; label: string }) {
  const creep = priceCreep(lines, today);
  const jumps = spikes(lines, from, to);
  const once = oneOffs(lines, from, to, today);
  const seasons = seasonal(lines, today);
  const income = incomeCalendar(lines, today);
  const date = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: d.slice(0, 4) === String(today.getFullYear()) ? undefined : "numeric" });
  // fixed three letters: some locales write "Sept." where the bars need "Sep"
  const monthName = (i: number) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i];
  const avg = seasons ? seasons.filter((s) => s.years).reduce((a, s) => a + s.average, 0) / Math.max(1, seasons.filter((s) => s.years).length) : 0;
  const peaks = seasons ? seasons.filter((s) => s.years && s.average > avg * 1.15).sort((a, b) => b.average - a.average) : [];
  const found = (n: number) => `${n} found`;
  const rows: { key: string; icon: React.ReactNode; title: string; gist: React.ReactNode; body: React.ReactNode }[] = [];
  if (creep.length > 0) rows.push({
    key: "creep", icon: <TrendingUp />, title: "Prices that went up",
    gist: <>+<span className="nl-amt">{compact(creep.reduce((s, p) => s + (p.now - p.before), 0) * 12)}</span> a year</>,
    body: (
      <>
        <ul className="pattern-list">
          {creep.slice(0, 5).map((p) => (
            <li key={p.merchant}><span>{tidyMerchant(p.merchant)}<span className="caption">since {date(p.since)}</span></span>
              <span className="nl-amt">{money(p.before)} → {money(p.now)}</span></li>
          ))}
        </ul>
        <p className="caption">About {money(creep.reduce((s, p) => s + (p.now - p.before), 0) * 12)} more a year than before.</p>
      </>
    ),
  });
  if (jumps.length > 0) rows.push({
    key: "spikes", icon: <Flame />, title: "Bigger than usual", gist: found(jumps.length),
    body: (
      <ul className="pattern-list">
        {jumps.slice(0, 5).map((s) => (
          <li key={s.merchant + s.date}><span>{tidyMerchant(s.merchant)}<span className="caption">{date(s.date)}, usually {compact(s.usual)}</span></span>
            <span className="nl-amt">{money(s.amount)}</span></li>
        ))}
      </ul>
    ),
  });
  if (once.items.length > 0) rows.push({
    key: "once", icon: <Sparkles />, title: "One-off costs", gist: found(once.items.length),
    body: (
      <>
        <p className="pattern-lede">A typical month in {label.toLowerCase().startsWith("last") ? "this stretch" : label} cost <strong className="nl-amt">{money(once.typical)}</strong> without them, <span className="nl-amt">{money(once.withAll)}</span> with.</p>
        <ul className="pattern-list">
          {once.items.slice(0, 4).map((o) => (
            <li key={o.merchant + o.date}><span>{tidyMerchant(o.merchant)}<span className="caption">{date(o.date)} · {o.bucket}</span></span><span className="nl-amt">{money(o.amount)}</span></li>
          ))}
        </ul>
      </>
    ),
  });
  if (seasons && peaks.length > 0) rows.push({
    key: "season", icon: <Leaf />, title: "Months that cost more", gist: peaks.slice(0, 2).map((p) => monthName(p.month)).join(", "),
    body: (
      <>
        <div className="season" role="img" aria-label={`Average spending by calendar month. Highest: ${peaks.map((p) => monthName(p.month)).join(", ")}.`}>
          {seasons.map((s) => (
            <span key={s.month} className={peaks.some((p) => p.month === s.month) ? "peak" : ""} title={`${monthName(s.month)}: ${money(s.average)} on average`}>
              <i style={{ height: `${(s.average / Math.max(...seasons.map((x) => x.average), 1)) * 100}%` }} />
              <em>{monthName(s.month)}</em>
            </span>
          ))}
        </div>
        <p className="caption">{peaks.slice(0, 3).map((p) => `${monthName(p.month)} averages ${compact(p.average)}`).join(", ")}, against {compact(avg)} in a usual month.</p>
      </>
    ),
  });
  if (income.length > 0) rows.push({
    key: "income", icon: <CalendarClock />, title: "When money comes in",
    gist: <><span className="nl-amt">{compact(income.reduce((s, i) => s + i.monthly, 0))}</span> a month</>,
    body: (
      <ul className="pattern-list">
        {income.slice(0, 5).map((i) => (
          <li key={i.name}><span>{tidyMerchant(i.name)}<span className="caption">{i.days.length ? `around the ${i.days.map(ordinal).join(" and ")}` : "most months"}</span></span>
            <span className="nl-amt">{money(i.monthly)}<span className="caption"> a month</span></span></li>
        ))}
      </ul>
    ),
  });
  if (rows.length === 0) return <p className="empty">No patterns stand out in this data.</p>;
  return (
    <div className="patterns nl-card">
      {rows.map((r, i) => (
        <details key={r.key} className="pattern" name="patterns" open={i === 0}>
          <summary>
            <span className="pattern-icon" aria-hidden>{r.icon}</span>
            <span className="pattern-title">{r.title}</span>
            <span className="pattern-gist">{r.gist}</span>
            <ChevronDown className="pattern-chevron" size={16} strokeWidth={2} aria-hidden />
          </summary>
          <div className="pattern-body">{r.body}</div>
        </details>
      ))}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
