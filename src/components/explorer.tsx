"use client";

import { LOCALE } from "@/lib/format";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { ChartTip } from "./chart-tip";
import { Columns, Matrix, PaceChart, PairedColumns, compact, money } from "./charts";
import { CustomRange, FilterBar } from "./filter-menus";
import { CategoryIcon, bucketColor } from "./icons";
import { Menu, type Option } from "./menu";
import { deleteView, saveView, type FormState } from "@/lib/actions";
import { EXPLORE_EVENT, type ExploreRequest } from "./season-link";
import {
  GROUPS, MEASURES, VIEW_KEYS, acrossYears, alignSlots, daysIn, firstWholeMonth, flowOf, groupBy, naturalOrder, runningTotal, seriesOf, slotsOf,
  totals, upToDay, usualBand, weightOf, yearByYear,
  datesOf, type Daily, type ExploreLine, type FlowNode, type GroupKey, type MeasureKey, type Row, type ViewKey, type Window, type YearRow,
} from "@/lib/explore";
import { addDaysIso, addMonths } from "@/lib/dates";
import { formatCents, isoDate } from "@/lib/money";
import { tidyMerchant } from "@/lib/merchant";
import { matchesLine, parseSearch, withoutChip, type SearchContext } from "@/lib/search";

type Ctx = Omit<SearchContext, "today" | "buckets"> & { buckets: { id: string; name: string; parent_id: string | null; color: string | null; icon?: string | null; kind?: string }[] };
type SortKey = "label" | "value" | "share" | "count" | "average" | "change";
type Sort = { key: SortKey; dir: "asc" | "desc" };
export type SavedView = { id: string; name: string; query: string };
// each chart's name in plain words, and the shorter one a narrow card uses
const TABS: Record<ViewKey, [string, string]> = {
  breakdown: ["Where it went", "Where"], flow: ["In and out", "Flow"], mix: ["Shares", "Shares"], time: ["When it went", "When"],
  running: ["Pace", "Pace"], heatmap: ["What and when", "Grid"], years: ["Year by year", "Years"],
};
const monthName = (i: number) => new Date(2000, i, 1).toLocaleDateString(LOCALE, { month: "long" });
const dayName = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** How each chart says its numbers: the measure's format, an amount set in figures, and the change against the comparison. */
type Say = { fmt: (v: number) => string; A: (v: number) => React.ReactNode; cmp: (inAll?: boolean) => React.ReactNode };

/**
 * One chart for every question. Above the card sit the page's filters, dates and comparison: they shape everything
 * on the page, Patterns and Insights included. Inside the card, the tab and "Show … by …" only change this chart.
 * Each chart opens with one sentence that answers it. Lines for both periods arrive once; everything except a
 * change of filters or comparison (or a first look across the years) is computed here, instantly.
 */
export function Explorer({ today: todayIso, earliest, lines, daily, a, b, years = [], vs, vsOptions, ctx, initial, saved }: {
  today: string; earliest: string | null; lines: ExploreLine[];
  /** Each day's sums for this month and the twelve before it, when the dates are one month; for the pace band and the weight badge. */
  daily: Daily | null;
  a: Window; b: Window | null; years?: Window[]; vs: string; vsOptions: Option[];
  ctx: Ctx; saved: SavedView[];
  initial: { q: string; g: GroupKey; m: MeasureKey; view: ViewKey; s: SortKey; dir: "asc" | "desc" };
}) {
  const router = useRouter();
  // the page this explorer lives on; a peek opened on top changes the address, and that one is not ours to rewrite
  const [path] = useState(usePathname());
  const [q, setQText] = useState(initial.q);
  const [compareTo, setCompareTo] = useState(vs);
  const [pickVs, setPickVs] = useState(false);
  const [g, setG] = useState(initial.g);
  const [m, setM] = useState(initial.m);
  const [view, setView] = useState(initial.view);
  const [sort, setSort] = useState<Sort>({ key: initial.s, dir: initial.dir });
  const [why, setWhy] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const today = useMemo(() => new Date(`${todayIso}T12:00`), [todayIso]);
  const { slice, chips } = useMemo(() => parseSearch(q, { ...ctx, today }), [q, ctx, today]);
  // typing "every october" or "average" turns to Year by year, once; picking another chart after that sticks
  const setQ = (next: string) => {
    if (acrossYears(parseSearch(next, { ...ctx, today }).slice) && !acrossYears(slice)) setView("years");
    setQText(next);
  };
  // a month tapped in "Months that cost more" further down the page
  useEffect(() => {
    const ask = (e: Event) => { const { q: next, view: v } = (e as CustomEvent<ExploreRequest>).detail; setQText(next); setView(v); };
    window.addEventListener(EXPLORE_EVENT, ask);
    return () => window.removeEventListener(EXPLORE_EVENT, ask);
  }, []);

  // the URL describes the view. Filters and the comparison also shape the rest of the page, so they go to the server;
  // so does a first look across the years, which needs every year on record
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (compareTo !== "none") p.set("vs", compareTo);
    if (view !== (acrossYears(slice) ? "years" : "breakdown")) p.set("view", view);
    if (g !== "top_bucket") p.set("g", g);
    if (m !== "spend") p.set("m", m);
    if (sort.key !== "value") p.set("s", sort.key);
    if (sort.dir !== "desc") p.set("dir", sort.dir);
    return p.toString();
  }, [q, slice, compareTo, view, g, m, sort]);
  const serverKey = `${q.trim()}|${compareTo}|${view === "years" ? "y" : ""}`;
  const [sent, setSent] = useState(`${initial.q.trim()}|${vs}|${initial.view === "years" ? "y" : ""}`);
  const fetching = useRef<string | null>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    const url = `${path}${query ? `?${query}` : ""}`;
    if (serverKey !== sent) {
      timer.current = setTimeout(() => {
        fetching.current = url;
        setSent(serverKey);
        start(() => router.replace(url, { scroll: false }));
      }, 450);
    } else if (!pending && url !== fetching.current && url !== `${window.location.pathname}${window.location.search}`) {
      // local-only changes (chart style, grouping, sort) just update the address; rewriting it while the server
      // is fetching would cancel that fetch, which is why filters once seemed to do nothing
      window.history.replaceState(window.history.state, "", url);
    }
    return () => clearTimeout(timer.current);
  }, [query, serverKey, sent, path, router, pending]);
  const waiting = pending || serverKey !== sent;

  const lookup = useMemo(() => ({ buckets: ctx.buckets, members: ctx.members, splitCount: countSplits(lines) }), [ctx, lines]);
  const kept = useMemo(() => {
    const filters = { ...slice, from: undefined, to: undefined };
    return lines.filter((l) => matchesLine(l, filters, lookup));
  }, [lines, slice, lookup]);
  const inA = kept.filter((l) => (!a.from || l.date >= a.from) && l.date < a.to);
  // the same filters in Activity; with no dates typed, the page's own window goes along (whole months, as here)
  const since = a.from && !slice.from ? ` since ${new Date(`${a.from}T12:00`).toLocaleDateString(LOCALE, { month: "long", year: "numeric" })}` : "";
  // "average" picks a chart, not transactions, so it stays here
  const plain = chips.filter((c) => c.kind === "average").reduce((s, c) => withoutChip(s, c), q);
  const see = `/transactions?q=${encodeURIComponent(`${plain.trim()}${since}`.trim())}`;
  const open = () => router.push(see);
  const inB = b ? kept.filter((l) => l.date >= b.from! && l.date < b.to) : [];
  const firstLoaded = lines.reduce((min, l) => (l.date < min ? l.date : min), "9999-12-31");
  // compare only when the history reaches back to the start of the comparison (within a month)
  const B = b?.from && firstLoaded <= addDaysIso(b.from, 31) ? b : null;
  const tomorrow = addDaysIso(todayIso, 1);

  // one calendar month, whole or still running: it gets the usual-month band and the weight badge
  const oneMonth = a.from?.endsWith("-01") && (a.to === addMonths(a.from, 1) || (a.to <= addMonths(a.from, 1) && a.to > todayIso)) ? a.from : null;
  const live = !!oneMonth && todayIso >= oneMonth && todayIso < addMonths(oneMonth, 1);
  const first = firstWholeMonth(earliest);
  // the month the years chart follows: the one typed ("every october"), or the month on screen
  const month = slice.monthOfYear ?? (oneMonth ? Number(oneMonth.slice(5, 7)) - 1 : undefined);
  const weight = useMemo(() => {
    if (!oneMonth || !daily) return null;
    const len = daysIn({ from: oneMonth, to: addMonths(oneMonth, 1), label: "" });
    return weightOf(daily, oneMonth, live ? Number(todayIso.slice(8, 10)) : len, "spend", first);
  }, [oneMonth, daily, live, todayIso, first]);
  const band = useMemo(() => (view === "running" && oneMonth && daily && compareTo !== "years" ? usualBand(daily, oneMonth, m, first) : null),
    [view, oneMonth, daily, compareTo, m, first]);
  const yearly = useMemo(() => (view === "years" ? yearByYear(kept, m, { from: null, to: tomorrow, earliest, today: todayIso, month }) : null),
    [view, kept, m, tomorrow, earliest, todayIso, month]);

  const now = totals(inA, m), before = B ? totals(inB, m) : null;
  const fmt = (v: number) => (m === "count" ? Math.round(v).toLocaleString(LOCALE) : m === "net" ? formatCents(Math.round(v)) : money(Math.round(v)));
  const A = (v: number) => <span className="nl-amt">{fmt(v)}</span>;
  // "12% less than last month ($1,840)"; "In all, …" when the chart's big number is one part of the whole
  const cmp = (inAll = false) => {
    if (b && !B) return `No history for ${b.label} yet`;
    if (!B || !before) return null;
    if (!before.value) return `Nothing in ${B.label}`;
    const lead = (s: string) => (inAll ? `In all, ${s}` : cap(s));
    const d = (now.value - before.value) / Math.abs(before.value);
    if (Math.abs(d) < 0.01) return <>{lead(`about the same as ${B.label}`)} ({A(before.value)})</>;
    return <>{lead(`${Math.abs(Math.round(d * 100))}% ${d > 0 ? "more" : m === "count" ? "fewer" : "less"} than ${B.label}`)} ({A(before.value)})</>;
  };
  const say: Say = { fmt, A, cmp };
  // the charts draw themselves in again when what they show changes (dates, filters once they settle, grouping,
  // measure, or new data arriving), not when sorting or showing more rows
  const run = [view, g, m, sent, a.from, a.to, B?.from, lines.length].join("|");
  const aName = datesOf(a);
  const aTitle = a.label.replace(/ \(.*\)$/, "");
  // legends say which is which in words; the real dates sit under the title
  const bTitle = B ? cap(B.label) : "";
  const tab = (k: ViewKey): [string, string] =>
    k === "years" && month !== undefined ? [`Every ${monthName(month)}`, "Years"] : k === "breakdown" && m === "income" ? ["Where it came from", "Where"] : TABS[k];
  const drillCtx = { q, setQ, ctx, slice, today, see, open };

  return (
    <div className="explore-wrap" id="explore" data-pending={waiting || undefined}>
      {/* the whole page: what to look at, and when */}
      <div className="explore-scope">
        <div className="explore-filters">
          <form role="search" className="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={18} strokeWidth={1.75} className="nl-icon" aria-hidden />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter"
              placeholder="Filter: groceries last year, by Partner, over $50…" autoComplete="off" spellCheck={false} />
            {q && <button type="button" className="search-clear" aria-label="Clear" onClick={() => setQ("")}><X size={16} strokeWidth={2} /></button>}
          </form>
          <FilterBar q={q} setQ={setQ} ctx={ctx} today={today} earliest={earliest} defaultDates={acrossYears(slice) ? "All time" : "This month"} />
          {chips.length > 0 && (
            <ul className="chip-row" aria-label="Filters">
              {chips.map((ch, i) => (
                <li key={`${ch.token}-${i}`} className={`qchip qchip-${ch.kind}`}>{ch.label}
                  <button type="button" aria-label={`Remove ${ch.label}`} onClick={() => setQ(withoutChip(q, ch))}><X size={13} strokeWidth={2.25} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="explore-head">
          <div className="explore-name">
            <div className="explore-titlerow">
              <p className="explore-title">{aTitle}</p>
              {weight && (
                <button type="button" className={`weight weight-${weight.level}`} aria-expanded={why} onClick={() => setWhy((w) => !w)}
                  aria-label={`Spending ${live ? "so far" : "this month"}: ${weightWord[weight.level].toLowerCase()}. Why?`}>
                  {weightWord[weight.level]}
                </button>
              )}
            </div>
            {a.from && (
              // one sentence: "Nov 1, 2025 – Oct 26, 2026 compared with [the period before ▾]"
              <div className="explore-dates">
                {aTitle !== aName && <span>{aName}</span>}
                <span className="explore-vs">compared with
                  <Menu compact value={compareTo} options={vsOptions} onChange={(v) => {
                    if (v === "custom") return setPickVs(true);
                    setPickVs(false); setCompareTo(v);
                    // every year is a picture of lines; the pace chart is where it shows
                    if (v === "years") setView("running");
                  }} />
                </span>
                {pickVs && <CustomRange from={B?.from ?? undefined} to={B?.to} today={today} label="Compare with these dates"
                  onCancel={() => setPickVs(false)} onApply={(from, last) => { setPickVs(false); setCompareTo(`${from}..${last}`); }} />}
              </div>
            )}
            {why && weight && (
              <p className="explore-why">
                {Math.abs(weight.now - weight.usual) < 100 ? "About the same as" : <>About {money(Math.round(Math.abs(weight.now - weight.usual)))} {weight.now > weight.usual ? "more than" : "less than"}</>} the
                average of the last {weight.months} months by {live ? dayName(todayIso) : "the end of the month"}. Lighter or heavier means more than 10% off it.
              </p>
            )}
          </div>
          <SaveView query={query} saved={saved} />
        </div>
      </div>

      {/* this card only: which chart, and what it counts */}
      <section className="explorer" aria-label="Chart">
        <div className="explore-views">
          <div className="nl-seg explore-tabs" role="radiogroup" aria-label="Chart">
            {VIEW_KEYS.map((k) => {
              const [long, short] = tab(k);
              return <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}><span className="lbl-l">{long}</span><span className="lbl-s" aria-hidden>{short}</span></button>;
            })}
          </div>
          {view !== "flow" && (
            <div className="explore-sentence">
              <span>Show</span>
              <Menu value={view === "mix" && m === "net" ? "spend" : m} options={Object.entries(MEASURES).filter(([k]) => view !== "mix" || k !== "net").map(([value, label]) => ({ value, label }))}
                onChange={(v) => setM(v as MeasureKey)} />
              {(view === "breakdown" || view === "heatmap") && (
                <>
                  <span>by</span>
                  <Menu value={g} options={Object.entries(GROUPS).filter(([k]) => view === "breakdown" || !naturalOrder(k as GroupKey)).map(([value, label]) => ({ value, label }))}
                    onChange={(v) => setG(v as GroupKey)} />
                </>
              )}
            </div>
          )}
        </div>

        <div className="explore-body">
          {(view === "years" ? kept : inA).length === 0 ? (
            <p className="empty">Nothing matches{waiting ? " yet. Loading those dates…" : ". Try removing a filter."}</p>
          ) : view === "breakdown" ? (
            <Breakdown run={run} inA={inA} inB={inB} B={B} g={g} m={m} say={say} total={now.value} sort={sort} setSort={setSort} drillCtx={drillCtx} />
          ) : view === "flow" ? (
            <Flow key={run} inA={inA} ctx={ctx} />
          ) : view === "mix" ? (
            <Mix key={run} inA={inA} m={m === "net" ? "spend" : m} {...drillCtx} />
          ) : view === "time" ? (
            <OverTime inA={inA} inB={inB} a={a} B={B} m={m} say={say} firstLoaded={firstLoaded} aName={aTitle} bName={bTitle} ctx={ctx} />
          ) : view === "running" ? (
            band && oneMonth ? (
              <MonthPace key={run} month={oneMonth} band={band} inA={inA} inB={inB} B={B} m={m} say={say} todayIso={todayIso} />
            ) : (
              <Running key={run} inA={inA} inB={inB} a={a} B={B} m={m} say={say} todayIso={todayIso} aName={B && compareTo === "years" ? yearsLabel(a) : aTitle} bName={bTitle}
                older={compareTo === "years" ? years.filter((w) => w.from! >= addDaysIso(firstLoaded, -31)).map((w) => ({ w, lines: kept.filter((l) => l.date >= w.from! && l.date < w.to) })) : []} />
            )
          ) : view === "heatmap" ? (
            <Heat inA={inA} a={a} g={g} m={m} say={say} firstLoaded={firstLoaded} ctx={ctx} />
          ) : yearly && (
            <Years key={run} yearly={yearly} m={m} say={say} month={month} todayIso={todayIso} ctx={ctx} />
          )}
        </div>
      </section>
    </div>
  );
}

/** The one sentence a chart opens with: what it shows, the number that answers it, and what that means. */
function Headline({ kicker, big, sub }: { kicker: string; big: React.ReactNode; sub?: React.ReactNode[] }) {
  const parts = (sub ?? []).filter(Boolean);
  return (
    <div className="xhead">
      <p className="xhead-kicker">{kicker}</p>
      <p className="xhead-big">{big}</p>
      {parts.length > 0 && <p className="xhead-sub">{parts.map((p, i) => <span key={i}>{p}</span>)}</p>}
    </div>
  );
}

function Breakdown({ run, inA, inB, B, g, m, say, total, sort, setSort, drillCtx }: {
  run: string; inA: ExploreLine[]; inB: ExploreLine[]; B: Window | null; g: GroupKey; m: MeasureKey; say: Say; total: number;
  sort: Sort; setSort: (f: (s: Sort) => Sort) => void; drillCtx: DrillCtx;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [picked, setPicked] = useState<Row | null>(null);
  const { fmt } = say;
  const rows = groupBy(inA, g, m);
  const was = new Map(B ? groupBy(inB, g, m).map((r) => [r.key, r.value]) : []);
  const sum = rows.reduce((s, r) => s + r.value, 0);
  const table = rows.map((r) => ({ ...r, share: sum ? r.value / sum : 0, average: r.count ? r.value / r.count : 0, was: was.get(r.key) ?? 0, change: B ? r.value - (was.get(r.key) ?? 0) : 0 }));
  const sorted = [...table].sort((x, y) => {
    if (sort.key === "label") return x.label.localeCompare(y.label, undefined, { numeric: true }) * (sort.dir === "asc" ? 1 : -1);
    const d = (x[sort.key] as number) - (y[sort.key] as number);
    return sort.dir === "asc" ? d : -d;
  });
  const ordered = naturalOrder(g) ? [...table].sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true })) : sorted;
  const bars = showAll ? ordered : ordered.slice(0, 8);
  const max = Math.max(...ordered.map((r) => Math.max(Math.abs(r.value), Math.abs(r.was))), 1);
  const colorOf = (r: Row) => (g === "top_bucket" || g === "bucket" ? colorOfBucket(drillCtx.ctx, r, g) : "var(--series-spend)");
  // the answer in words: which one took the most
  const top = [...table].sort((x, y) => y.value - x.value)[0];
  const share = top && sum > 0 ? pct(top.value / sum) : "";
  const most = rows.length < 2 || !share || m === "net" ? null
    : m === "spend" ? `${top.label} took the most, ${share}.` : m === "income" ? `Most came from ${top.label}, ${share}.` : `${top.label} had the most, ${share}.`;
  const header = (key: SortKey, label: string, cls = "num") => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}>
        {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={12} strokeWidth={2.25} aria-hidden /> : <ArrowDown size={12} strokeWidth={2.25} aria-hidden />)}
      </button>
    </th>
  );
  return (
    <>
      <Headline kicker={MEASURES[m]} big={say.A(total)} sub={[most, say.cmp()]} />
      <ul key={run} className="xbars" aria-label="Chart">
        {bars.map((r, i) => (
          <li key={r.key} style={{ "--i": i } as React.CSSProperties}>
            {/* a bar opens what is behind it; filtering the page to it is one more tap in there */}
            <button type="button" className="xbar" onClick={() => setPicked(r)} aria-haspopup="dialog">
              <span className="xbar-label">{r.label}</span>
              <span className="xbar-track">
                <span className="xbar-fill" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: colorOf(r) }} />
                {B && r.was > 0 && <span className="xbar-was" style={{ left: `${(Math.abs(r.was) / max) * 100}%` }} aria-hidden />}
              </span>
              <span className="xbar-value nl-amt">{fmt(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="explore-more">
        {B && <span className="caption"><span className="xbar-was-key" aria-hidden />{B.label}</span>}
        {ordered.length > 8 && <button type="button" className="textlink" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 8" : `Show all ${ordered.length}`}</button>}
        <button type="button" className="textlink" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>{showTable ? "Hide table" : "Show table"}</button>
        <Link href={drillCtx.see} className="textlink see-tx">See these transactions<ArrowRight size={14} strokeWidth={2} aria-hidden /></Link>
      </div>
      {showTable && (
        <div className="table-wrap explore-table">
          <table className="table">
            <caption className="sr-only">{MEASURES[m]} by {GROUPS[g]}</caption>
            <thead><tr>
              {header("label", GROUPS[g], "")}{header("value", MEASURES[m])}{m !== "count" && header("share", "Share")}
              {header("count", "Count")}{m !== "count" && header("average", "Average")}{B && header("change", "Change")}
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{fmt(r.value)}</td>
                  {m !== "count" && <td className="num">{Math.round(r.share * 100)}%</td>}
                  <td className="num">{r.count}</td>
                  {m !== "count" && <td className="num">{fmt(r.average)}</td>}
                  {B && <td className={`num ${r.change === 0 ? "" : (m === "spend" ? r.change > 0 : r.change < 0) ? "worse" : "better"}`}>{r.change === 0 ? "–" : `${r.change > 0 ? "+" : "−"}${m === "count" ? Math.abs(r.change) : compact(Math.abs(r.change)).replace("−", "")}`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picked && createPortal(
        <GroupSheet title={picked.label} keys={[picked.key]} row={picked} g={g} m={m} inA={inA} total={sum} fmt={fmt} drillCtx={drillCtx} close={() => setPicked(null)} />,
        document.body)}
    </>
  );
}

type DrillCtx = {
  q: string; setQ: (q: string) => void; ctx: Ctx; slice: ReturnType<typeof parseSearch>["slice"]; today: Date;
  /** Activity with the same filters and dates, and a way there. */
  see: string; open: () => void;
};

const colorOfBucket = (ctx: Ctx, r: Pick<Row, "label">, g: GroupKey) => {
  const bk = ctx.buckets.find((x) => x.name === r.label && (g === "bucket" || !x.parent_id));
  return bk ? bucketColor(bk.color, bk.id) : "var(--cat-8)";
};

/** Filtering the page to a group, or taking that filter off again: the button inside a group's peek. */
function drillTo(g: GroupKey, { q, setQ, ctx, slice, today }: DrillCtx) {
  // a row's filter chip, if it is already on
  const chipOf = (r: Row) => {
    const { chips } = parseSearch(q, { ...ctx, today });
    if (g === "top_bucket" || g === "bucket") return chips.find((c) => c.kind === "bucket" && c.label.split(", ").includes(r.label));
    if (g === "merchant") return chips.find((c) => c.kind === "text" && c.token === `"${r.label}"`);
    if (g === "account") return chips.find((c) => c.kind === "account" && c.label.split(", ").includes(r.label));
    if (g === "person") return chips.find((c) => c.kind === "person" && c.label === `By ${r.label}`);
    return undefined;
  };
  const drill = (r: Row) => {
    const words = g === "top_bucket" || g === "bucket" ? r.label : g === "merchant" ? `"${r.label}"` : g === "account" ? r.label
      : g === "person" ? `by ${r.label.split(" ")[0]}` : null;
    if (!words) return;
    if (isOn(r)) { const ch = chipOf(r); if (ch) setQ(withoutChip(q, ch)); return; }
    setQ(`${q.trim()} ${words}`.trim());
  };
  const isOn = (r: Row) => (g === "top_bucket" || g === "bucket") ? slice.buckets.some((id) => ctx.buckets.find((x) => x.id === id)?.name === r.label) : !!chipOf(r);
  const drillable = g === "top_bucket" || g === "bucket" || g === "merchant" || g === "account" || g === "person";
  return { drill, isOn, drillable };
}

/**
 * A bucket's (or place's, account's, person's) transactions in a center peek, with what they add up to, their share
 * and where most of it went. "Show only …" filters the whole page to it; that is the one way a chart changes the page.
 */
function GroupSheet({ title, keys, row, g, m, inA, total, fmt, drillCtx, close }: {
  title: string; keys: string[]; row: Row | null; g: GroupKey; m: MeasureKey; inA: ExploreLine[]; total: number; fmt: (v: number) => string;
  drillCtx: DrillCtx; close: () => void;
}) {
  const lines = inA.filter((l) => countedBy(m)(l) && keys.includes(groupBy([l], g, m)[0]?.key ?? ""));
  const value = totals(lines, m).value;
  const per = m === "count" ? "transactions" : MEASURES[m].toLowerCase();
  const places = g === "merchant" ? [] : groupBy(lines, "merchant", m).filter((r) => r.value > 0).sort((x, y) => y.value - x.value).slice(0, 3).map((r) => r.label);
  const summary = [
    fmt(value), m !== "net" && total > 0 ? `${pct(value / total)} of ${per}` : "",
    places.length ? `${m === "income" ? "Mostly from" : "Most at"} ${places.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
  const { drill, isOn, drillable } = drillTo(g, drillCtx);
  const action = row && drillable
    ? { label: isOn(row) ? `Stop showing only ${row.label}` : `Show only ${row.label}`, run: () => { drill(row); close(); } }
    : undefined;
  return <SlotSheet title={title} lines={lines} ctx={drillCtx.ctx} close={close} summary={summary} action={action} />;
}

const MIX: { g: GroupKey; title: string }[] = [
  { g: "top_bucket", title: "Buckets" }, { g: "merchant", title: "Places" }, { g: "account", title: "Accounts" }, { g: "person", title: "People" },
];
const SLICES = 5;

/**
 * The same money split four ways, side by side: which buckets, places, accounts and people it went through.
 * Each ring keeps its five biggest parts and folds the rest into Other, so it reads at a glance; the exact
 * numbers sit beside it. A part, in the ring or the list, opens its transactions.
 */
function Mix({ inA, m, ...drillCtx }: { inA: ExploreLine[]; m: MeasureKey } & DrillCtx) {
  const fmt = (v: number) => (m === "count" ? Math.round(v).toLocaleString(LOCALE) : money(Math.round(v)));
  const [picked, setPicked] = useState<{ title: string; g: GroupKey; keys: string[]; row: Row | null; total: number } | null>(null);
  const rings = MIX.map(({ g, title }) => {
    const rows = groupBy(inA, g, m).filter((r) => r.value > 0).sort((x, y) => y.value - x.value);
    const sum = rows.reduce((s, r) => s + r.value, 0);
    const kept = rows.length > SLICES + 1 ? rows.slice(0, SLICES) : rows;
    const rest = rows.slice(kept.length);
    const parts = [
      ...kept.map((r, i) => ({ row: r as Row | null, key: r.key, keys: [r.key], label: r.label, value: r.value,
        color: g === "top_bucket" ? colorOfBucket(drillCtx.ctx, r, g) : `var(--cat-${i + 1})` })),
      ...(rest.length ? [{ row: null, key: "other", keys: rest.map((r) => r.key), label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: "var(--cat-8)" }] : []),
    ];
    return { g, title, sum, parts };
  });
  const lead = rings[0];
  const pick = (ring: (typeof rings)[number], key: string) => {
    const p = ring.parts.find((x) => x.key === key);
    if (p) setPicked({ title: p.row ? p.label : `Other ${ring.title.toLowerCase()}`, g: ring.g, keys: p.keys, row: p.row, total: ring.sum });
  };
  const biggest = lead.parts[0];
  return (
    <>
    {biggest && (
      <Headline kicker="Biggest share" big={pct(biggest.value / lead.sum)} sub={[
        m === "spend" ? <>of {<span className="nl-amt">{fmt(lead.sum)}</span>} spending went to {biggest.label}</>
          : m === "income" ? <>of {<span className="nl-amt">{fmt(lead.sum)}</span>} money in came from {biggest.label}</>
          : `of ${fmt(lead.sum)} transactions were ${biggest.label}`,
      ]} />
    )}
    <ul className="mix" aria-label="Shares">
      {rings.map((ring, n) => {
        const { g, title, sum, parts } = ring;
        return (
          <li key={g} className="mix-item" style={{ "--i": n } as React.CSSProperties}>
            <h3 className="mix-title">{title}</h3>
            {sum === 0 ? <p className="empty">Nothing here.</p> : (
              <>
                <Doughnut onPick={(key) => pick(ring, key)}
                  parts={parts.map((p) => ({ key: p.key, value: p.value, color: p.color, label: p.label, tip: `${p.label}\n${fmt(p.value)} · ${pct(p.value / sum)}` }))}
                  lead={{ share: pct(parts[0].value / sum), label: parts[0].label }} title={`${title}: ${parts.map((p) => `${p.label} ${pct(p.value / sum)}`).join(", ")}`} />
                <ul className="mix-legend">
                  {parts.map((p) => (
                    <li key={p.key}>
                      <button type="button" className="mix-row" onClick={() => pick(ring, p.key)} aria-haspopup="dialog">
                        <span className="mix-dot" style={{ background: p.color }} aria-hidden />
                        <span className="mix-label">{p.label}</span>
                        <span className="mix-value nl-amt">{fmt(p.value)}</span>
                        <span className="mix-share">{pct(p.value / sum)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        );
      })}
    </ul>
    {picked && createPortal(
      <GroupSheet title={picked.title} keys={picked.keys} row={picked.row} g={picked.g} m={m} inA={inA} total={picked.total} fmt={fmt}
        drillCtx={drillCtx} close={() => setPicked(null)} />, document.body)}
    </>
  );
}

const pct = (x: number) => (x > 0 && x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);

/** A ring of parts with a 2px gap between them, the biggest part's share in the middle. */
function Doughnut({ parts, lead, title, onPick }: {
  parts: { key: string; value: number; color: string; tip: string; label: string }[]; lead: { share: string; label: string }; title: string;
  /** Opens a part's transactions. */
  onPick?: (key: string) => void;
}) {
  const r = 42, c = 2 * Math.PI * r, gap = parts.length > 1 ? 1.5 : 0;
  const sweep = useId();
  const sum = parts.reduce((s, p) => s + p.value, 0);
  // where each part starts around the ring
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.value / sum) * c, 0));
  return (
    <ChartTip className="doughnut">
      <svg viewBox="0 0 100 100" role={onPick ? "group" : "img"} aria-label={title}>
        {/* one stroke drawn round the ring uncovers the parts in order, so they arrive as a single sweep */}
        <mask id={sweep} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
          <circle cx="50" cy="50" r={r} className="doughnut-sweep" pathLength={1} transform="rotate(-90 50 50)" />
        </mask>
        <circle cx="50" cy="50" r={r} className="doughnut-track" />
        <g mask={`url(#${sweep})`}>
        {parts.map((p, i) => (
          <circle key={p.key} cx="50" cy="50" r={r} stroke={p.color} className="doughnut-seg" data-tip={p.tip}
            {...(onPick ? {
              "data-pick": "", role: "button", tabIndex: 0, "aria-label": `${p.label}. Show these transactions`,
              onClick: () => onPick(p.key),
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(p.key); } },
            } : {})}
            strokeDasharray={`${Math.max((p.value / sum) * c - gap, 0.6)} ${c}`} strokeDashoffset={-starts[i]} transform="rotate(-90 50 50)" />
        ))}
        </g>
      </svg>
      <span className="doughnut-lead" aria-hidden><strong>{lead.share}</strong><span>{lead.label}</span></span>
    </ChartTip>
  );
}

/** The transactions a measure counts: spending or income on their own, both for net and count. */
const countedBy = (m: MeasureKey) => (l: ExploreLine) => (m === "spend" || m === "income" ? l.kind === m : l.kind === "spend" || l.kind === "income");

/** Columns per day, week or month for the view, beside the comparison's matching slot. */
function OverTime({ inA, inB, a, B, m, say, firstLoaded, aName, bName, ctx }: {
  inA: ExploreLine[]; inB: ExploreLine[]; a: Window; B: Window | null; m: MeasureKey; say: Say; firstLoaded: string; aName: string; bName: string; ctx: Ctx;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const { fmt } = say;
  const slots = slotsOf(a, firstLoaded);
  const slot = slots.find((s) => s.key === picked);
  const sheet = slot && createPortal(
    // the same transactions the column counts
    <SlotSheet title={slot.long} lines={inA.filter((l) => l.date >= slot.from && l.date < slot.to && countedBy(m)(l))} ctx={ctx} close={() => setPicked(null)} />, document.body);
  const now = seriesOf(inA, slots, m);
  const then = B ? alignSlots(slots, a, B) : [];
  const was = B ? seriesOf(inB, then, m) : [];
  const color = m === "income" ? "var(--series-income)" : "var(--series-spend)";
  // the biggest day, week or month, and the whole against the comparison
  const top = now.reduce((best, v, i) => (v > now[best] ? i : best), 0);
  const span = slots[0] ? daysIn({ from: slots[0].from, to: slots[0].to, label: "" }) : 0;
  const unit = span === 1 ? "day" : span === 7 ? "week" : "month";
  const head = slots[top] && <Headline kicker={`${m === "count" ? "Busiest" : "Biggest"} ${unit}`} big={say.A(now[top])} sub={[slots[top].long, say.cmp(true)]} />;
  if (!B) {
    return <>
      {head}
      <Columns caption={`${MEASURES[m]} over time`} color={color} onPick={setPicked}
        items={slots.map((s, i) => ({ key: s.key, label: s.label, short: s.short, value: Math.max(now[i], 0), tip: `${s.long}\n${fmt(now[i])}`, strong: true }))} />
      {sheet}
    </>;
  }
  return (
    <>
    {head}
    <PairedColumns caption={`${MEASURES[m]} over time`} net={false} onPick={setPicked}
      series={{ a: { label: aName, color }, b: { label: B ? bName : "", color: "var(--series-prev)" } }}
      items={slots.map((s, i) => ({ key: s.key, label: s.label, short: s.short, a: now[i], b: B ? was[i] : 0, strong: true,
        tip: `${s.long}: ${fmt(now[i])}\n${then[i]?.long ?? bName}: ${fmt(was[i])}` }))} />
    {sheet}
    </>
  );
}

/**
 * Transactions in a center peek: a day, week or month from When it went, a square from the grid, a year, or a
 * group from Where it went and Shares (with what they add up to, and "Show only …"). Each transaction opens in its
 * own peek on top, and Back returns here.
 */
function SlotSheet({ title, lines, ctx, close, summary, action }: {
  title: string; lines: ExploreLine[]; ctx: Ctx; close: () => void;
  /** What these add up to, in a line under the title; the count otherwise. */
  summary?: string;
  /** One button under the summary, such as filtering the page to this group. */
  action?: { label: string; run: () => void };
}) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  // the latest close, so a parent drawing again does not move focus back into the peek
  const shut = useRef(close);
  useEffect(() => { shut.current = close; });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    // Escape closes the top peek only: a transaction opened from here closes first
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && document.querySelectorAll(".peek").length === 1) shut.current(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; before?.focus({ preventScroll: true }); };
  }, []);
  // one row per transaction (lines are splits), newest first
  const txs = [...lines.reduce((m, l) => {
    const t = m.get(l.transaction_id);
    if (t) { t.amount += l.amount_cents; if (!t.buckets.includes(l.bucket)) t.buckets.push(l.bucket); }
    else m.set(l.transaction_id, { id: l.transaction_id, date: l.paid_on ?? l.date, merchant: tidyMerchant(l.merchant), amount: l.amount_cents, buckets: [l.bucket], bucketId: l.bucket_id });
    return m;
  }, new Map<string, { id: string; date: string; merchant: string; amount: number; buckets: string[]; bucketId: string | null }>()).values()]
    .sort((x, y) => y.date.localeCompare(x.date));
  const count = `${txs.length} ${txs.length === 1 ? "transaction" : "transactions"}`;
  return (
    <div className="peek-scrim slot-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="peek slot-sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
        <header className="sheet-head">
          <div className="slot-head">
            <h2 className="heading" id={id}>{title}</h2>
            <p className="caption">{summary ? <><span className="nl-amt">{summary}</span> · {count}</> : count}</p>
            {action && <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary slot-action" onClick={action.run}>{action.label}</button>}
          </div>
          <button type="button" className="icon-btn peek-btn" onClick={close} aria-label="Close"><X size={18} strokeWidth={1.75} /></button>
        </header>
        <div className="peek-body">
          {txs.length === 0 ? <p className="empty">Nothing here.</p> : (
            <ul className="slot-list">
              {txs.map((t) => {
                const b = ctx.buckets.find((x) => x.id === t.bucketId);
                return (
                  <li key={t.id}>
                    <Link href={`/transactions/${t.id}`} scroll={false} className="slot-row">
                      <CategoryIcon icon={b?.icon} color={b?.color} seed={t.bucketId ?? t.merchant} />
                      <span className="slot-main">
                        <span className="slot-name">{t.merchant}</span>
                        <span className="caption">{dayName(t.date)} · {t.buckets.join(", ")}</span>
                      </span>
                      <span className={`nl-amt${t.amount > 0 ? " in" : ""}`}>{formatCents(t.amount, { sign: t.amount > 0 })}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * This month's running total over the range of the last few months (the shaded band) and their average (the dashed
 * line). Moving along the chart, by pointer or arrow keys, asks the headline about that day.
 */
function MonthPace({ month, band, inA, inB, B, m, say, todayIso }: {
  month: string; band: NonNullable<ReturnType<typeof usualBand>>; inA: ExploreLine[]; inB: ExploreLine[]; B: Window | null; m: MeasureKey; say: Say; todayIso: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  const fade = useId();
  const len = band.mean.length;
  const end = addMonths(month, 1);
  const live = todayIso >= month && todayIso < end;
  const now = runningTotal(inA, { from: month, to: end, label: "" }, m, addDaysIso(todayIso, 1));
  const was = B ? runningTotal(inB, B, m).slice(0, len) : [];
  const values = [...band.high, ...band.low, ...now, ...was];
  const lo = Math.min(0, ...values), top = Math.max(0, ...values);
  const hi = top + (top - lo) * 0.08 || 1;
  const x = (i: number) => (len > 1 ? (i / (len - 1)) * 100 : 0);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const line = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const range = `${line(band.high)} ${band.low.map((v, i) => [i, v] as const).reverse().map(([i, v]) => `L${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ")} Z`;
  const last = now.length - 1;
  const i = at ?? Math.max(last, 0);

  // the headline follows the day under the pointer, and today otherwise
  const by = i === len - 1 ? "by the end of the month" : `by ${dayName(addDaysIso(month, i))}`;
  const has = i <= last;
  const v = has ? now[i] : band.mean[i];
  const gap = v - band.mean[i];
  const things = m === "count" ? " transactions" : "";
  const vsUsual = Math.abs(gap) < (m === "count" ? 2 : 4000) ? `About the same as usual ${by}`
    : <>About {say.A(Math.abs(gap))}{things} {gap > 0 ? "more" : m === "count" ? "fewer" : "less"} than usual {by}</>;
  const kicker = at !== null ? dayName(addDaysIso(month, i)) : live ? "How the month is going" : "How the month went";
  const big = !has ? say.A(v) : at === null && live ? <>{say.A(v)} so far</> : say.A(v);
  const sub = !has ? ["What a usual month had by then"]
    : [vsUsual, at !== null && B && i < was.length ? <>{cap(B.label)}: {say.A(was[i])}</> : null];

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.round(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * (len - 1)));
  };
  const key = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step) { e.preventDefault(); setAt(Math.min(Math.max((at ?? i) + step, 0), len - 1)); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); setAt(e.key === "Home" ? 0 : len - 1); }
    else if (e.key === "Escape") setAt(null);
  };
  return (
    <figure className="mpace-figure">
      <Headline kicker={kicker} big={big} sub={sub} />
      <ul className="mpace-legend" aria-hidden>
        <li><i className="k-now" />{live ? "This month" : new Date(`${month}T12:00`).toLocaleDateString(LOCALE, { month: "long" })}</li>
        <li><i className="k-mean" />Usual</li>
        <li><i className="k-band" />Range, last {band.months} months</li>
        {B && was.length > 0 && <li><i className="k-prev" />{cap(B.label)}</li>}
      </ul>
      <div className="mpace" tabIndex={0} role="slider" aria-label="Day of the month" aria-valuemin={1} aria-valuemax={len} aria-valuenow={i + 1}
        aria-valuetext={dayName(addDaysIso(month, i))}
        onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setAt(null)} onKeyDown={key} onBlur={() => setAt(null)}>
        <svg className="mpace-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={range} className="mpace-band" />
          {lo < 0 && <path d={`M0,${y(0)} L100,${y(0)}`} className="mpace-zero" />}
          <path d={line(band.mean)} className="mpace-mean" />
          {was.length > 0 && <path d={line(was)} className="mpace-prev" />}
        </svg>
        {/* this month is only as wide as the days so far, so the pen reaches today exactly when the drawing ends */}
        {last >= 0 && (
          <svg className="mpace-svg mpace-now" viewBox={`0 0 ${Math.max(x(last), 0.01)} 100`} preserveAspectRatio="none"
            style={{ width: `${Math.max(x(last), 0.01)}%` }} aria-hidden>
            <defs>
              <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.16 }} />
                <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <path d={`${line(now)} L${x(last).toFixed(2)},${y(Math.max(lo, 0))} L0,${y(Math.max(lo, 0))} Z`} fill={`url(#${fade})`} />
            <path d={line(now)} className="mpace-line" />
          </svg>
        )}
        {last >= 0 && <span className="mpace-dot" style={{ left: `${x(last)}%`, top: `${y(now[last])}%` }} aria-hidden />}
        {at !== null && <>
          <span className="mpace-hair" style={{ left: `${x(i)}%` }} aria-hidden />
          <span className={`mpace-mark${has ? "" : " usual"}`} style={{ left: `${x(i)}%`, top: `${y(v)}%` }} aria-hidden />
        </>}
      </div>
      <div className="mpace-axis" aria-hidden>
        <span>{dayName(month)}</span><span>{dayName(addDaysIso(month, Math.floor((len - 1) / 2)))}</span><span>{dayName(addDaysIso(month, len - 1))}</span>
      </div>
    </figure>
  );
}

/** The running total through the view against the comparison, day by day. */
function Running({ inA, inB, a, B, m, say, todayIso, aName, bName, older }: {
  inA: ExploreLine[]; inB: ExploreLine[]; a: Window; B: Window | null; m: MeasureKey; say: Say; todayIso: string; aName: string; bName: string;
  older: { w: Window; lines: ExploreLine[] }[];
}) {
  if (!a.from) return <p className="empty">Pick dates to see the pace.</p>;
  const tomorrow = isoDate(new Date(new Date(`${todayIso}T12:00`).getTime() + 86_400_000));
  const now = runningTotal(inA, a, m, tomorrow);
  const was = B ? runningTotal(inB, B, m) : [];
  const days = daysIn(a);
  const label = (d: Date) => d.toLocaleDateString(LOCALE, days > 62 ? { month: "short" } : { month: "short", day: "numeric" });
  const start = new Date(`${a.from}T12:00`);
  const axis = [label(start), label(new Date(start.getTime() + (days / 2) * 86_400_000)), label(new Date(start.getTime() + (days - 1) * 86_400_000))];
  return <>
    <Headline kicker="How it built up" big={say.A(now.at(-1) ?? 0)} sub={[say.cmp()]} />
    <PaceChart now={now} before={was} days={days} today={now.length} axis={axis} labels={{ now: aName, before: B ? bName : "" }}
      older={B ? older.map(({ w, lines }) => ({ label: w.label, values: runningTotal(lines, w, m) })) : []} />
  </>;
}

/**
 * One column per year: a month across the years ("every October"), or each year's typical month. A dashed line
 * marks the usual one. While the month is still running, its column shows what has gone so far, with a paler
 * reach to where it is heading; the earlier years carry a mark at where they stood by the same day.
 */
function Years({ yearly, m, say, month, todayIso, ctx }: {
  yearly: ReturnType<typeof yearByYear>; m: MeasureKey; say: Say; month?: number; todayIso: string; ctx: Ctx;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const { rows, average, months } = yearly;
  if (rows.length === 0) return <p className="empty">Nothing on record for these dates yet.</p>;
  const { fmt, A } = say;
  const name = month === undefined ? null : monthName(month);
  const unit = name ?? "month";
  const day = Number(todayIso.slice(8, 10));
  const running = rows.find((r) => r.partial && r.year === Number(todayIso.slice(0, 4))) ?? null;
  const past = rows.filter((r) => !r.partial);
  const byToday = (r: YearRow) => upToDay(r.lines, day, m);
  // where the month is heading: what it has so far, plus what a usual one still added after today
  const usualByToday = name && running && past.length ? past.reduce((s, r) => s + byToday(r), 0) / past.length : null;
  const ahead = usualByToday !== null && months > 0 ? running!.value + average - usualByToday : null;
  const projected = ahead === null ? null : m === "net" ? ahead : Math.max(running!.value, ahead);
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), Math.abs(average), Math.abs(projected ?? 0), 1);
  const h = (v: number) => `${(Math.abs(v) / max) * 100}%`;
  const row = rows.find((r) => r.year === picked);
  const moved = rows.some((r) => r.lines.some((l) => l.paid_on));
  const fewer = m === "count" ? "fewer" : "less";
  const head = running && name
    ? <Headline kicker={`Every ${name}`} big={<>{A(running.value)} so far</>}
        sub={months ? [<>Usual {name}: {A(average)}</>, projected !== null ? <>on pace for about {A(projected)}</> : null] : [`No finished ${name} on record yet`]} />
    : months
      ? <Headline kicker={name ? `A usual ${name}` : "A usual month"} big={A(average)} sub={[`Over ${months} ${name ? (months === 1 ? "year" : "years") : (months === 1 ? "month" : "months")}`]} />
      : <Headline kicker={name ? `Every ${name}` : "Year by year"} big={A(rows.at(-1)!.value)} sub={[`No finished ${unit} on record yet`]} />;
  return (
    <>
      {head}
      <ChartTip className="ycols-chart">
        <div className="ycols" role="group" aria-label={name ? `${MEASURES[m]} in ${name}, year by year` : `${MEASURES[m]} in a usual month, year by year`}>
          {months > 0 && <span className="ycols-usual" style={{ "--at": Math.abs(average) / max } as React.CSSProperties} aria-hidden><em>usual {compactOf(m, average)}</em></span>}
          {rows.map((r, i) => {
            const isLive = r === running;
            const diff = r.value - average;
            const tip = [
              `${r.long}${r.partial ? ", so far" : ""}`, fmt(r.value),
              months && !r.partial ? (Math.abs(diff) < 1 ? `Same as a usual ${unit}` : `${fmt(Math.abs(diff))} ${diff > 0 ? "more" : fewer} than a usual ${unit}`) : "",
              isLive && projected !== null ? `On pace for about ${fmt(projected)}` : "",
            ].filter(Boolean).join("\n");
            return (
              <button key={r.year} type="button" className={`ycol${isLive ? " is-live" : ""}${r.partial ? " is-partial" : ""}`} style={{ "--i": i } as React.CSSProperties}
                data-tip={tip} aria-label={tip.replace(/\n/g, ", ")} onClick={() => setPicked(r.year)}>
                <span className="ycol-plot">
                  {isLive && projected !== null && <span className="ycol-proj" style={{ height: h(projected) }} />}
                  <span className="ycol-bar" style={{ height: h(r.value) }} />
                  {usualByToday !== null && !r.partial && <span className="ycol-tick" style={{ bottom: h(byToday(r)) }} />}
                  <span className="ycol-amt nl-amt" style={{ bottom: h(Math.max(Math.abs(r.value), isLive ? Math.abs(projected ?? 0) : 0)) }}>{compactOf(m, r.value)}</span>
                </span>
                <span className="ycol-year">{r.year}</span>
              </button>
            );
          })}
        </div>
      </ChartTip>
      <div className="explore-more">
        {usualByToday !== null && <span className="caption"><span className="ycol-tick-key" aria-hidden />Where each year stood by {dayName(todayIso)}</span>}
        {moved && <span className="caption">Rent sent early and pay that arrives ahead count in the month they’re for.</span>}
      </div>
      {row && createPortal(
        <SlotSheet title={name ? row.long : `${row.long}${row.partial ? ", so far" : ""}`} ctx={ctx} close={() => setPicked(null)} lines={row.lines.filter(countedBy(m))} />, document.body)}
    </>
  );
}

const weightWord = { low: "Lighter than usual", mid: "About usual", high: "Heavier than usual" } as const;

/** Short amounts for labels over columns: "$1.2k"; counts as they are. */
const compactOf = (m: MeasureKey, v: number) => (m === "count" ? Math.round(v).toLocaleString(LOCALE) : compact(Math.round(v)));

/**
 * Where the money came from and where it went, in one picture: money in on the left, straight out to the
 * buckets it was spent in, what was set aside, and what was left. On a narrow card the same story is a waterfall:
 * what came in, each step down, and what was left at the end. Always money, whatever "Show" says.
 */
function Flow({ inA, ctx }: { inA: ExploreLine[]; ctx: Ctx }) {
  const f = useMemo(() => flowOf(inA), [inA]);
  const [picked, setPicked] = useState<{ node: FlowNode; side: "in" | "out" } | null>(null);
  if (!f.income && !f.out) return <p className="empty">No money came in or went out in these dates.</p>;
  const $ = (v: number) => <span className="nl-amt">{money(Math.round(v))}</span>;
  const colorOf = (n: FlowNode) =>
    n.role === "left" ? "var(--series-income)" : n.role === "aside" ? "var(--ink-muted)" : n.role === "short" ? "var(--ink-faint)"
      : n.key === "__other" ? "var(--cat-8)" : colorOfBucket(ctx, n, "top_bucket");
  // the transactions behind a node: one bucket's, everything else's, or what was set aside; "Left" has none
  const linesOf = (n: FlowNode, side: "in" | "out") => {
    if (n.role === "aside") return inA.filter((l) => l.kind === "saving" || l.kind === "goal");
    const kind = side === "in" ? "income" : "spend";
    if (n.key === "__all") return inA.filter((l) => l.kind === kind);
    const named = new Set((side === "in" ? f.sources : f.targets).filter((x) => !x.role && x.key !== "__other").map((x) => x.label));
    return inA.filter((l) => l.kind === kind && (n.key === "__other" ? !named.has(l.top_bucket) : l.top_bucket === n.label));
  };
  const pickable = (n: FlowNode) => n.role !== "left" && n.role !== "short";
  const pick = (node: FlowNode, side: "in" | "out") => { if (pickable(node)) setPicked({ node, side }); };
  return (
    <>
      <Headline kicker="In and out" big={f.left >= 0 ? <>{$(f.left)} left</> : <>{$(-f.left)} overspent</>}
        sub={[<>{$(f.income)} in · {$(f.out)} out</>]} />
      <div className="flow">
        <Sankey f={f} colorOf={colorOf} pick={pick} pickable={pickable} />
        <Waterfall f={f} colorOf={colorOf} pick={pick} pickable={pickable} />
      </div>
      {picked && createPortal(
        <SlotSheet title={picked.node.key === "__all" ? "Money in" : picked.node.label} ctx={ctx} close={() => setPicked(null)} lines={linesOf(picked.node, picked.side)} />, document.body)}
    </>
  );
}

type FlowProps = {
  f: ReturnType<typeof flowOf>; colorOf: (n: FlowNode) => string;
  pick: (n: FlowNode, side: "in" | "out") => void; pickable: (n: FlowNode) => boolean;
};

/**
 * Money in on the left and where it went on the right, as soft ribbons as wide as the money. The sources run together
 * into one bar in the middle and it splits out to the buckets, since a dollar of pay and a dollar of benefit buy
 * the same groceries. Pointing at a part lights its ribbon; pointing at the bar lights them all.
 */
function Sankey({ f, colorOf, pick, pickable }: FlowProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const [hover, setHover] = useState<string | null>(null);
  const grad = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(([e]) => { if (e.contentRect.width > 0) setWidth(Math.round(e.contentRect.width)); });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const W = Math.max(width, 480), nw = 10, pad = 14, step = 38;
  const xs = Math.round(W * 0.24), xt = Math.round(W * 0.72);
  const total = f.sources.reduce((s, n) => s + n.value, 0) || 1;
  // the nodes take about 60% of the height; each one keeps room for its two-line label, and the rest is air
  const base = Math.max(280, Math.max(f.sources.length, f.targets.length) * 40 + 2 * pad);
  const k = (base * 0.6) / total;
  const pack = (nodes: FlowNode[]) => {
    let centre = -Infinity, next = pad;
    return nodes.map((n) => {
      const h = n.value * k, y = Math.max(next, centre + step - h / 2);
      centre = y + h / 2; next = y + h + 8;
      return { n, y, h };
    });
  };
  const packed = [pack(f.sources), pack(f.targets)];
  const H = Math.max(base, ...packed.map((p) => (p.at(-1) ? p.at(-1)!.y + p.at(-1)!.h : 0) + pad));
  // whatever height is left over is shared out as even gaps, so both sides run top to bottom
  const [ins, outs] = packed.map((p) => {
    const spare = H - pad - (p.at(-1) ? p.at(-1)!.y + p.at(-1)!.h : 0);
    return p.length === 1 ? [{ ...p[0], y: (H - p[0].h) / 2 }] : p.map((s, i) => ({ ...s, y: s.y + (spare * i) / (p.length - 1) }));
  });
  // a ribbon starts under its node's centre and is only as tall as the node's straight side, so it never shows past
  // the rounded ends; a dot keeps a little less than its width
  const end = (s: { y: number; h: number }) => {
    const e = s.h > nw ? Math.max(s.h - nw, nw / 2) : s.h * 0.6;
    return { y: s.y + (s.h - e) / 2, h: e };
  };
  // the bar in the middle holds all the money; each source joins it in order and each bucket leaves it, packed into
  // its straight side the same way
  const mid = Math.round((xs + nw + xt) / 2), trunk = { y: (H - total * k) / 2, h: total * k };
  const tEnd = end(trunk), c = tEnd.h / trunk.h;
  // 0.5px of overlap where ribbons meet in the bar hides the seams between them
  const ribbon = (xn: number, n: { y: number; h: number }, y: number, h: number) => {
    const xm = (xn + mid) / 2, b = y + h + 0.5;
    return `M${xn},${n.y} C${xm},${n.y} ${xm},${y} ${mid},${y} L${mid},${b} C${xm},${b} ${xm},${n.y + n.h} ${xn},${n.y + n.h} Z`;
  };
  const links = [
    ...ins.map((s, i) => ({ side: "in" as const, s, d: ribbon(xs + nw / 2, end(s), tEnd.y + startsAt(f.sources, i) * k * c, s.h * c) })),
    ...outs.map((s, j) => ({ side: "out" as const, s, d: ribbon(xt + nw / 2, end(s), tEnd.y + startsAt(f.targets, j) * k * c, s.h * c) })),
  ].filter((l) => l.s.h > 0.15);
  // each label sits level with its node; packing already left room for two lines
  const inY = ins.map((s) => s.y + s.h / 2), outY = outs.map((s) => s.y + s.h / 2);
  const lit = (side: "in" | "out", key: string) => !hover || hover === "trunk" || hover === `${side}:${key}`;
  const share = (v: number) => pct(v / total);
  const node = (s: { n: FlowNode; y: number; h: number }, side: "in" | "out", x: number, ly: number) => {
    const can = pickable(s.n);
    const h = Math.max(s.h, nw);
    return (
      <g key={`${side}:${s.n.key}`} className={`sankey-node${lit(side, s.n.key) ? " is-lit" : ""}${can ? " can-pick" : ""}`}
        data-tip={`${s.n.label}\n${money(Math.round(s.n.value))} · ${share(s.n.value)}`}
        onPointerEnter={() => setHover(`${side}:${s.n.key}`)} onPointerLeave={() => setHover(null)}
        {...(can ? { role: "button", tabIndex: 0, "aria-label": `${s.n.label}, ${money(Math.round(s.n.value))}. Show these transactions`,
          onClick: () => pick(s.n, side), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(s.n, side); } } } : {})}>
        <rect x={x} y={s.y + s.h / 2 - h / 2} width={nw} height={h} rx={nw / 2} style={{ fill: colorOf(s.n) }} />
        <text x={side === "in" ? x - 10 : x + nw + 10} y={ly} textAnchor={side === "in" ? "end" : "start"}>
          <tspan className="sankey-name" dy="-0.15em">{s.n.label}</tspan>
          <tspan className="sankey-amt" x={side === "in" ? x - 10 : x + nw + 10} dy="1.3em">{money(Math.round(s.n.value))}</tspan>
        </text>
      </g>
    );
  };
  return (
    <div className="flow-sankey" ref={box}>
      <ChartTip>
        <svg className="sankey" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} data-hover={hover ? "" : undefined} role="group"
          aria-label={`Money in, ${f.sources.map((n) => `${n.label} ${money(Math.round(n.value))}`).join(", ")}; out to ${f.targets.map((n) => `${n.label} ${money(Math.round(n.value))}`).join(", ")}`}>
          <defs>
            {/* each ribbon fades from its node's colour to the bar's */}
            {links.map((l, i) => (
              <linearGradient key={`${l.side}:${l.s.n.key}`} id={`${grad}${i}`} gradientUnits="userSpaceOnUse"
                x1={l.side === "in" ? xs + nw : xt} x2={l.side === "in" ? mid - nw / 2 : mid + nw / 2} y1="0" y2="0">
                <stop offset="0" style={{ stopColor: colorOf(l.s.n) }} />
                <stop offset="1" style={{ stopColor: "var(--series-income)" }} />
              </linearGradient>
            ))}
          </defs>
          {/* drawn opaque inside one see-through group, so where ribbons overlap they don't darken */}
          <g className="sankey-links">
            {links.map((l, i) => (
              <path key={`${l.side}:${l.s.n.key}`} d={l.d} className={`sankey-link${lit(l.side, l.s.n.key) ? " is-lit" : ""}`}
                fill={`url(#${grad}${i})`}
                data-tip={`${l.s.n.label}\n${money(Math.round(l.s.n.value))} · ${share(l.s.n.value)}`}
                onPointerEnter={() => setHover(`${l.side}:${l.s.n.key}`)} onPointerLeave={() => setHover(null)} />
            ))}
          </g>
          <rect x={mid - nw / 2} y={trunk.y} width={nw} height={Math.max(trunk.h, nw)} rx={nw / 2} className="sankey-trunk"
            onPointerEnter={() => setHover("trunk")} onPointerLeave={() => setHover(null)} />
          {ins.map((s, i) => node(s, "in", xs, inY[i]))}
          {outs.map((s, j) => node(s, "out", xt, outY[j]))}
        </svg>
      </ChartTip>
    </div>
  );
}

/** How much of the stack sits before the i-th node. */
function startsAt(nodes: FlowNode[], i: number) {
  return nodes.slice(0, i).reduce((s, n) => s + n.value, 0);
}

/** The same story as steps: what came in, each bucket taking its part, and what was left. */
function Waterfall({ f, colorOf, pick, pickable }: FlowProps) {
  const lo = Math.min(0, f.left), hi = Math.max(f.income, 0);
  const span = hi - lo || 1;
  const place = (a: number, b: number) => ({ left: `${((Math.min(a, b) - lo) / span) * 100}%`, width: `${Math.max((Math.abs(b - a) / span) * 100, 0.4)}%` });
  const steps = [
    { n: { key: "__all", label: "Came in", value: f.income } as FlowNode, side: "in" as const, from: 0, to: f.income, color: "var(--accent)", sign: "" },
    ...f.targets.filter((t) => t.role !== "left").map((t, i, outs) => {
      const from = f.income - startsAt(outs, i);
      return { n: t, side: "out" as const, from, to: from - t.value, color: colorOf(t), sign: "−" };
    }),
    f.left >= 0
      ? { n: { key: "__left", label: "Left", value: f.left, role: "left" } as FlowNode, side: "out" as const, from: 0, to: f.left, color: "var(--series-income)", sign: "" }
      : { n: { key: "__short", label: "Overspent", value: -f.left, role: "short" } as FlowNode, side: "out" as const, from: f.left, to: 0, color: "var(--ink-faint)", sign: "−" },
  ];
  return (
    <ul className="wfall" aria-label="Money in and out, step by step">
      {steps.map((s, i) => {
        const can = s.n.key === "__all" ? f.income > 0 : pickable(s.n);
        return (
          <li key={s.n.key} className={s.n.role === "left" ? "is-left" : undefined} style={{ "--i": i } as React.CSSProperties}>
            <button type="button" className="wfall-row" disabled={!can} onClick={() => pick(s.n, s.side)}>
              <span className="wfall-label">{s.n.label}</span>
              <span className="wfall-track">
                {lo < 0 && <span className="wfall-zero" style={{ left: `${((0 - lo) / span) * 100}%` }} aria-hidden />}
                <span className="wfall-bar" style={{ ...place(s.from, s.to), background: s.color }} />
              </span>
              <span className="wfall-value nl-amt">{s.sign}{money(Math.round(s.n.value))}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Groups × time, one hue: where and when the money went. */
function Heat({ inA, a, g, m, say, firstLoaded, ctx }: { inA: ExploreLine[]; a: Window; g: GroupKey; m: MeasureKey; say: Say; firstLoaded: string; ctx: Ctx }) {
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  const slots = slotsOf(a, firstLoaded);
  if (slots.length < 2) return <p className="empty">Pick a longer date range for this grid.</p>;
  const rows = groupBy(inA, g, m).sort((x, y) => y.value - x.value).slice(0, 12);
  const grid = rows.map((r) => {
    const mine = inA.filter((l) => groupBy([l], g, m)[0]?.key === r.key);
    return { bucket: r.label, total: r.value, values: seriesOf(mine, slots, m), lines: mine };
  });
  // a square opens its transactions: that group, in that slot, the ones the measure counts
  const cell = picked && grid[picked.row] && slots[picked.col];
  // the darkest square, named the way the sheet would title it
  const top = grid.flatMap((r, row) => r.values.map((v, col) => ({ v, row, col }))).reduce((b, c) => (c.v > b.v ? c : b), { v: 0, row: -1, col: -1 });
  return <>
    {top.row >= 0 && <Headline kicker={m === "count" ? "Busiest square" : "Biggest square"} big={say.A(top.v)} sub={[`${grid[top.row].bucket}, ${slots[top.col].long}`]} />}
    <Matrix current="" rows={grid} months={slots.map((s) => ({ key: s.key, label: s.label, long: s.long }))} onPick={(row, col) => setPicked({ row, col })} />
    {cell && createPortal(
      <SlotSheet title={`${grid[picked.row].bucket}, ${cell.long}`} ctx={ctx} close={() => setPicked(null)}
        lines={grid[picked.row].lines.filter((l) => l.date >= cell.from && l.date < cell.to && countedBy(m)(l))} />, document.body)}
  </>;
}

/** This stretch named by its year, to sit beside the earlier years: "2026", or "2025–26" across two. */
function yearsLabel(w: Window): string {
  const y1 = w.from!.slice(0, 4), y2 = addDaysIso(w.to, -1).slice(0, 4);
  return y1 === y2 ? y1 : `${y1}–${y2.slice(2)}`;
}

function countSplits(lines: ExploreLine[]) {
  const n = new Map<string, number>();
  for (const l of lines) n.set(l.transaction_id, (n.get(l.transaction_id) ?? 0) + 1);
  return n;
}

/** Save the current view under a name, and the saved views as one-tap chips. */
function SaveView({ query, saved }: { query: string; saved: SavedView[] }) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [state, act, saving] = useActionState(async (_: FormState, form: FormData) => {
    const r = await saveView(String(form.get("name") ?? ""), query);
    if (r?.ok) setNaming(false);
    return r;
  }, null);
  const path = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const here = saved.find((v) => v.query === query);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menu saved-views" ref={root}>
      <button type="button" className="menu-button" aria-expanded={open} onClick={() => { setOpen((o) => !o); setNaming(false); }}>
        <Bookmark size={15} strokeWidth={1.75} aria-hidden />
        <span className="menu-value">{here?.name ?? "Views"}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className="menu-pop end saved-pop">
          {saved.length > 0 && (
            <ul className="menu-list" aria-label="Saved views">
              {saved.map((v) => (
                <li key={v.id} className="saved-row">
                  <a className="menu-item" href={`${path}?${v.query}`} aria-current={v === here || undefined}>
                    <span className="menu-check">{v === here && <Check size={14} strokeWidth={2.25} />}</span>
                    <span className="menu-item-label"><span>{v.name}</span></span>
                  </a>
                  <button type="button" className="saved-delete" aria-label={`Delete ${v.name}`} onClick={() => deleteView(v.id)}><X size={14} strokeWidth={2} /></button>
                </li>
              ))}
            </ul>
          )}
          {naming ? (
            <form action={act} className="save-form">
              <input className="input" name="name" placeholder="Name, e.g. Baby costs 2025" required maxLength={60} autoFocus aria-label="Name" />
              <button className="nl-btn nl-btn-sm nl-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
            </form>
          ) : (
            <button type="button" className="menu-item saved-new" onClick={() => setNaming(true)} disabled={!!here}>
              <span className="menu-check"><Plus size={14} strokeWidth={2} aria-hidden /></span>
              <span className="menu-item-label"><span>{here ? "This view is saved" : "Save this view"}</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
