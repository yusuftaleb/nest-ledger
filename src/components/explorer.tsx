"use client";

import { LOCALE } from "@/lib/format";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, Search, X } from "lucide-react";
import { ChartTip } from "./chart-tip";
import { Columns, Matrix, PaceChart, PairedColumns, compact, money } from "./charts";
import { CustomRange, FilterBar } from "./filter-menus";
import { CategoryIcon, bucketColor } from "./icons";
import { Menu, type Option } from "./menu";
import { deleteView, saveView, type FormState } from "@/lib/actions";
import { EXPLORE_EVENT, type ExploreRequest } from "./season-link";
import {
  GROUPS, MEASURES, acrossYears, alignSlots, daysIn, groupBy, monthsIn, naturalOrder, runningTotal, seriesOf, slotsOf, totals, yearByYear,
  datesOf, type ExploreLine, type GroupKey, type MeasureKey, type Row, type Window,
} from "@/lib/explore";
import { addDaysIso } from "@/lib/dates";
import { formatCents, isoDate } from "@/lib/money";
import { tidyMerchant } from "@/lib/merchant";
import { matchesLine, parseSearch, withoutChip, type SearchContext } from "@/lib/search";

type Ctx = Omit<SearchContext, "today" | "buckets"> & { buckets: { id: string; name: string; parent_id: string | null; color: string | null; icon?: string | null; kind?: string }[] };
type SortKey = "label" | "value" | "share" | "count" | "average" | "change";
type Sort = { key: SortKey; dir: "asc" | "desc" };
export type SavedView = { id: string; name: string; query: string };
export const VIEWS = { breakdown: "Breakdown", mix: "Mix", time: "Over time", running: "Running total", heatmap: "Heatmap", years: "Year by year" } as const;
export type ViewKey = keyof typeof VIEWS;
// on a phone the six tabs share one row, so the long names give way
const VIEWS_SHORT: Record<ViewKey, string> = { breakdown: "Breakdown", mix: "Mix", time: "Time", running: "Running", heatmap: "Heatmap", years: "Years" };

/**
 * One chart for every question. Filters (search, dates, bucket, account, person, type, amount, status) and the
 * comparison pick the data; the view picks the chart: what it went on, its mix four ways, how it moved over time, the running total
 * against the comparison, or a group × time heatmap. Lines for both periods arrive once; everything except a
 * change of filters or comparison (which also reshapes the rest of the page) is computed here, instantly.
 */
export function Explorer({ today: todayIso, earliest, lines, a, b, years = [], vs, vsOptions, ctx, initial, saved }: {
  today: string; earliest: string | null; lines: ExploreLine[]; a: Window; b: Window | null; years?: Window[]; vs: string; vsOptions: Option[];
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

  // the URL describes the view. Filters and the comparison also shape the rest of the page, so they go to the server.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (compareTo !== "prev") p.set("vs", compareTo);
    if (view !== (acrossYears(slice) ? "years" : "breakdown")) p.set("view", view);
    if (g !== "top_bucket") p.set("g", g);
    if (m !== "spend") p.set("m", m);
    if (sort.key !== "value") p.set("s", sort.key);
    if (sort.dir !== "desc") p.set("dir", sort.dir);
    return p.toString();
  }, [q, slice, compareTo, view, g, m, sort]);
  const serverKey = `${q.trim()}|${compareTo}`;
  const [sent, setSent] = useState(`${initial.q.trim()}|${vs}`);
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

  const now = totals(inA, m), before = B ? totals(inB, m) : null;
  const yearly = useMemo(() => yearByYear(kept, m, { from: a.from, to: a.to, earliest, today: todayIso, month: slice.monthOfYear }), [kept, m, a.from, a.to, earliest, todayIso, slice.monthOfYear]);
  const days = Math.max(1, daysIn(a) || Math.round(monthsIn(a, inA) * 30.44));
  const fmt = (v: number) => (m === "count" ? Math.round(v).toLocaleString(LOCALE) : m === "net" ? formatCents(Math.round(v)) : money(Math.round(v)));
  const change = before && before.value ? (now.value - before.value) / Math.abs(before.value) : null;
  const worse = (d: number) => (m === "spend" ? d > 0 : d < 0);
  // the charts draw themselves in again when what they show changes (dates, filters once they settle, grouping,
  // measure, or new data arriving), not when sorting or showing more rows
  const run = [view, g, m, sent, a.from, a.to, B?.from, lines.length].join("|");
  const aName = datesOf(a);
  const bName = B ? datesOf(B) : "";
  const aTitle = a.label.replace(/ \(.*\)$/, "");
  // legends say which is which in words; the real dates sit under the title and the change
  const bTitle = B ? B.label[0].toUpperCase() + B.label.slice(1) : "";

  return (
    <div className="explorer" id="explore" data-pending={waiting || undefined}>
      <div className="explore-filters">
        <form role="search" className="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={18} strokeWidth={1.75} className="nl-icon" aria-hidden />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter"
            placeholder="Filter: groceries last year, by Partner, over $50…" autoComplete="off" spellCheck={false} />
          {q && <button type="button" className="search-clear" aria-label="Clear" onClick={() => setQ("")}><X size={16} strokeWidth={2} /></button>}
        </form>
        <FilterBar q={q} setQ={setQ} ctx={ctx} today={today} earliest={earliest} defaultDates={acrossYears(slice) ? "All time" : "Last 12 months"} />
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
          <p className="explore-title">{aTitle}</p>
          {a.from && (
            // one sentence: "Nov 1, 2025 – Oct 26, 2026 compared with [the period before ▾]"
            <div className="explore-dates">
              {aTitle !== aName && <span>{aName}</span>}
              <span className="explore-vs">compared with
                <Menu compact value={compareTo} options={vsOptions} onChange={(v) => {
                  if (v === "custom") return setPickVs(true);
                  setPickVs(false); setCompareTo(v);
                  // every year is a picture of lines; the running total is where it shows
                  if (v === "years") setView("running");
                }} />
              </span>
              {pickVs && <CustomRange from={B?.from ?? undefined} to={B?.to} today={today} label="Compare with these dates"
                onCancel={() => setPickVs(false)} onApply={(from, last) => { setPickVs(false); setCompareTo(`${from}..${last}`); }} />}
            </div>
          )}
        </div>
        <SaveView query={query} saved={saved} />
      </div>

      <dl className="kpis">
        <div><dt>{MEASURES[m]}</dt><dd>{fmt(now.value)}</dd>
          {change !== null && B && <dd className={`kpi-change ${worse(change) ? "worse" : "better"}`}>{change > 0 ? "+" : "−"}{Math.abs(Math.round(change * 100))}% vs {B.label}</dd>}
          {before && B && <dd className="kpi-change muted">{change === null ? `${B.label}: ` : ""}{fmt(before.value)}{bName !== B.label && ` · ${bName}`}</dd>}
          {b && !B && <dd className="kpi-change muted">No history for {b.label} yet</dd>}
        </div>
        {/* across years, the typical month counts finished months only; otherwise the total spread over the dates */}
        {m !== "count" && (acrossYears(slice) && yearly.months
          ? <div><dt>A month on average</dt><dd>{fmt(yearly.average)}</dd></div>
          : <div><dt>{days <= 120 ? "Per day" : "Per month"}</dt><dd>{fmt(days <= 120 ? now.value / days : now.value / monthsIn(a, inA))}</dd></div>)}
        <div><dt>Transactions</dt><dd>{now.transactions.toLocaleString(LOCALE)}</dd></div>
      </dl>

      <div className="explore-views">
        <div className="nl-seg" role="radiogroup" aria-label="Chart">
          {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}><span className="lbl-l">{VIEWS[k]}</span><span className="lbl-s">{VIEWS_SHORT[k]}</span></button>
          ))}
        </div>
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
      </div>

      {inA.length === 0 ? (
        <p className="empty">Nothing matches{waiting ? " yet. Loading those dates…" : ". Try removing a filter."}</p>
      ) : view === "breakdown" ? (
        <Breakdown run={run} inA={inA} inB={inB} B={B} g={g} m={m} fmt={fmt} ctx={ctx} sort={sort} setSort={setSort} q={q} setQ={setQ} slice={slice} today={today} see={see} open={open} />
      ) : view === "mix" ? (
        <Mix key={run} inA={inA} m={m === "net" ? "spend" : m} ctx={ctx} q={q} setQ={setQ} slice={slice} today={today} see={see} open={open} />
      ) : view === "time" ? (
        <OverTime inA={inA} inB={inB} a={a} B={B} m={m} fmt={fmt} firstLoaded={firstLoaded} aName={aTitle} bName={bTitle} ctx={ctx} />
      ) : view === "running" ? (
        <Running key={run} inA={inA} inB={inB} a={a} B={B} m={m} todayIso={todayIso} aName={B && compareTo === "years" ? yearsLabel(a) : aTitle} bName={bTitle}
          older={compareTo === "years" ? years.filter((w) => w.from! >= addDaysIso(firstLoaded, -31)).map((w) => ({ w, lines: kept.filter((l) => l.date >= w.from! && l.date < w.to) })) : []} />
      ) : view === "heatmap" ? (
        <Heat inA={inA} a={a} g={g} m={m} firstLoaded={firstLoaded} ctx={ctx} />
      ) : (
        <Years key={run} yearly={yearly} m={m} fmt={fmt} month={slice.monthOfYear} ctx={ctx} />
      )}
    </div>
  );
}

function Breakdown({ run, inA, inB, B, g, m, fmt, ctx, sort, setSort, q, setQ, slice, today, see, open }: {
  run: string; inA: ExploreLine[]; inB: ExploreLine[]; B: Window | null; g: GroupKey; m: MeasureKey; fmt: (v: number) => string; ctx: Ctx;
  sort: Sort; setSort: (f: (s: Sort) => Sort) => void; q: string; setQ: (q: string) => void;
  slice: ReturnType<typeof parseSearch>["slice"]; today: Date; see: string; open: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showTable, setShowTable] = useState(false);
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
  const colorOf = (r: Row) => (g === "top_bucket" || g === "bucket" ? colorOfBucket(ctx, r, g) : "var(--series-spend)");
  const { drill, isOn, drillable } = drillTo(g, { q, setQ, ctx, slice, today, see, open });
  const header = (key: SortKey, label: string, cls = "num") => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}>
        {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={12} strokeWidth={2.25} aria-hidden /> : <ArrowDown size={12} strokeWidth={2.25} aria-hidden />)}
      </button>
    </th>
  );
  return (
    <>
      <ul key={run} className="xbars" aria-label="Chart">
        {bars.map((r, i) => (
          <li key={r.key} style={{ "--i": i } as React.CSSProperties}>
            <button type="button" className={`xbar${isOn(r) ? " is-on" : ""}`} onClick={() => drill(r)} disabled={!drillable}
              title={drillable ? (isOn(r) ? "Remove this filter" : "Filter to this") : undefined}>
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
        <Link href={see} className="textlink see-tx">See these transactions<ArrowRight size={14} strokeWidth={2} aria-hidden /></Link>
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
    </>
  );
}

type DrillCtx = {
  q: string; setQ: (q: string) => void; ctx: Ctx; slice: ReturnType<typeof parseSearch>["slice"]; today: Date;
  /** Activity with the same filters and dates, and a way there. */
  see: string; open: () => void;
};

const colorOfBucket = (ctx: Ctx, r: Row, g: GroupKey) => {
  const bk = ctx.buckets.find((x) => x.name === r.label && (g === "bucket" || !x.parent_id));
  return bk ? bucketColor(bk.color, bk.id) : "var(--cat-8)";
};

/** Tapping a group filters the page to it; tapping it again takes that filter off. "See these transactions" goes to Activity. */
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

const MIX: { g: GroupKey; title: string }[] = [
  { g: "top_bucket", title: "Buckets" }, { g: "merchant", title: "Places" }, { g: "account", title: "Accounts" }, { g: "person", title: "People" },
];
const SLICES = 5;

/**
 * The same money split four ways, side by side: which buckets, places, accounts and people it went through.
 * Each ring keeps its five biggest parts and folds the rest into Other, so it reads at a glance; the exact
 * numbers sit beside it. Tapping a part filters the page to it, like the breakdown's bars.
 */
function Mix({ inA, m, ...drillCtx }: { inA: ExploreLine[]; m: MeasureKey } & DrillCtx) {
  const fmt = (v: number) => (m === "count" ? Math.round(v).toLocaleString(LOCALE) : money(Math.round(v)));
  // a slice of a ring opens its transactions; "Other" opens everything folded into it
  const [picked, setPicked] = useState<{ title: string; g: GroupKey; keys: string[] } | null>(null);
  const sheet = picked && createPortal(
    <SlotSheet title={picked.title} ctx={drillCtx.ctx} close={() => setPicked(null)}
      lines={inA.filter((l) => countedBy(m)(l) && picked.keys.includes(groupBy([l], picked.g, m)[0]?.key ?? ""))} />, document.body);
  return (
    <>
    <ul className="mix" aria-label="Mix">
      {MIX.map(({ g, title }, n) => {
        const rows = groupBy(inA, g, m).filter((r) => r.value > 0).sort((x, y) => y.value - x.value);
        const sum = rows.reduce((s, r) => s + r.value, 0);
        const kept = rows.length > SLICES + 1 ? rows.slice(0, SLICES) : rows;
        const rest = rows.slice(kept.length);
        const { drill, isOn } = drillTo(g, drillCtx);
        const parts = [
          ...kept.map((r, i) => ({ row: r as Row | null, key: r.key, keys: [r.key], label: r.label, value: r.value,
            color: g === "top_bucket" ? colorOfBucket(drillCtx.ctx, r, g) : `var(--cat-${i + 1})` })),
          ...(rest.length ? [{ row: null, key: "other", keys: rest.map((r) => r.key), label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: "var(--cat-8)" }] : []),
        ];
        return (
          <li key={g} className="mix-item" style={{ "--i": n } as React.CSSProperties}>
            <h3 className="mix-title">{title}</h3>
            {sum === 0 ? <p className="empty">Nothing here.</p> : (
              <>
                <Doughnut onPick={(key) => { const p = parts.find((x) => x.key === key); if (p) setPicked({ title: `${title}: ${p.label}`, g, keys: p.keys }); }}
                  parts={parts.map((p) => ({ key: p.key, value: p.value, color: p.color, label: p.label, tip: `${p.label}\n${fmt(p.value)} · ${pct(p.value / sum)}` }))}
                  lead={{ share: pct(parts[0].value / sum), label: parts[0].label }} title={`${title}: ${parts.map((p) => `${p.label} ${pct(p.value / sum)}`).join(", ")}`} />
                <ul className="mix-legend">
                  {parts.map((p) => (
                    <li key={p.key}>
                      <button type="button" className={`mix-row${p.row && isOn(p.row) ? " is-on" : ""}`} disabled={!p.row}
                        onClick={() => p.row && drill(p.row)} title={p.row ? (isOn(p.row) ? "Remove this filter" : "Filter to this") : undefined}>
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
    {sheet}
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
function OverTime({ inA, inB, a, B, m, fmt, firstLoaded, aName, bName, ctx }: {
  inA: ExploreLine[]; inB: ExploreLine[]; a: Window; B: Window | null; m: MeasureKey; fmt: (v: number) => string; firstLoaded: string; aName: string; bName: string; ctx: Ctx;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const slots = slotsOf(a, firstLoaded);
  const slot = slots.find((s) => s.key === picked);
  const sheet = slot && createPortal(
    // the same transactions the column counts
    <SlotSheet title={slot.long} lines={inA.filter((l) => l.date >= slot.from && l.date < slot.to && countedBy(m)(l))} ctx={ctx} close={() => setPicked(null)} />, document.body);
  const now = seriesOf(inA, slots, m);
  const then = B ? alignSlots(slots, a, B) : [];
  const was = B ? seriesOf(inB, then, m) : [];
  const color = m === "income" ? "var(--series-income)" : "var(--series-spend)";
  if (!B) {
    return <>
      <Columns caption={`${MEASURES[m]} over time`} color={color} onPick={setPicked}
        items={slots.map((s, i) => ({ key: s.key, label: s.label, short: s.short, value: Math.max(now[i], 0), tip: `${s.long}\n${fmt(now[i])}`, strong: true }))} />
      {sheet}
    </>;
  }
  return (
    <>
    <PairedColumns caption={`${MEASURES[m]} over time`} net={false} onPick={setPicked}
      series={{ a: { label: aName, color }, b: { label: B ? bName : "", color: "var(--series-prev)" } }}
      items={slots.map((s, i) => ({ key: s.key, label: s.label, short: s.short, a: now[i], b: B ? was[i] : 0, strong: true,
        tip: `${s.long}: ${fmt(now[i])}\n${then[i]?.long ?? bName}: ${fmt(was[i])}` }))} />
    {sheet}
    </>
  );
}

/**
 * One day's (or week's, or month's) transactions in a center peek, from a column in Over time. Each opens in
 * its own peek on top, and Back returns here.
 */
function SlotSheet({ title, lines, ctx, close }: { title: string; lines: ExploreLine[]; ctx: Ctx; close: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    // Escape closes the top peek only: a transaction opened from here closes first
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && document.querySelectorAll(".peek").length === 1) close(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; before?.focus({ preventScroll: true }); };
  }, [close]);
  // one row per transaction (lines are splits), newest first
  const txs = [...lines.reduce((m, l) => {
    const t = m.get(l.transaction_id);
    if (t) { t.amount += l.amount_cents; if (!t.buckets.includes(l.bucket)) t.buckets.push(l.bucket); }
    else m.set(l.transaction_id, { id: l.transaction_id, date: l.date, merchant: tidyMerchant(l.merchant), amount: l.amount_cents, buckets: [l.bucket], bucketId: l.bucket_id });
    return m;
  }, new Map<string, { id: string; date: string; merchant: string; amount: number; buckets: string[]; bucketId: string | null }>()).values()]
    .sort((x, y) => y.date.localeCompare(x.date));
  const day = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
  return (
    <div className="peek-scrim slot-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="peek slot-sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
        <header className="sheet-head">
          <div>
            <h2 className="heading" id={id}>{title}</h2>
            <p className="caption">{txs.length} {txs.length === 1 ? "transaction" : "transactions"}</p>
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
                        <span className="caption">{day(t.date)} · {t.buckets.join(", ")}</span>
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

/** The running total through the view against the comparison, day by day. */
function Running({ inA, inB, a, B, m, todayIso, aName, bName, older }: {
  inA: ExploreLine[]; inB: ExploreLine[]; a: Window; B: Window | null; m: MeasureKey; todayIso: string; aName: string; bName: string;
  older: { w: Window; lines: ExploreLine[] }[];
}) {
  if (!a.from) return <p className="empty">Pick dates to see a running total.</p>;
  const tomorrow = isoDate(new Date(new Date(`${todayIso}T12:00`).getTime() + 86_400_000));
  const now = runningTotal(inA, a, m, tomorrow);
  const was = B ? runningTotal(inB, B, m) : [];
  const days = daysIn(a);
  const label = (d: Date) => d.toLocaleDateString(LOCALE, days > 62 ? { month: "short" } : { month: "short", day: "numeric" });
  const start = new Date(`${a.from}T12:00`);
  const axis = [label(start), label(new Date(start.getTime() + (days / 2) * 86_400_000)), label(new Date(start.getTime() + (days - 1) * 86_400_000))];
  return <PaceChart now={now} before={was} days={days} today={now.length} axis={axis} labels={{ now: aName, before: B ? bName : "" }}
    older={B ? older.map(({ w, lines }) => ({ label: w.label, values: runningTotal(lines, w, m) })) : []} />;
}

/**
 * One bar per year with the average as a hairline: a month across the years ("every October"), or each year's
 * typical month. The month still running is faded and marked "so far"; a bar opens its transactions.
 */
function Years({ yearly, m, fmt, month, ctx }: { yearly: ReturnType<typeof yearByYear>; m: MeasureKey; fmt: (v: number) => string; month?: number; ctx: Ctx }) {
  const [picked, setPicked] = useState<number | null>(null);
  const { rows, average, months } = yearly;
  if (rows.length === 0) return <p className="empty">Nothing on record for these dates yet.</p>;
  const name = month === undefined ? null : new Date(2000, month, 1).toLocaleDateString(LOCALE, { month: "long" });
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), Math.abs(average), 1);
  const row = rows.find((r) => r.year === picked);
  const moved = rows.some((r) => r.lines.some((l) => l.month && l.month.slice(0, 7) !== l.date.slice(0, 7)));
  const per = m === "count" ? "transactions" : MEASURES[m].toLowerCase();
  return (
    <>
      <p className="years-lede">
        {months === 0
          ? name ? `No finished ${name} on record yet.` : "No finished month on record yet."
          : <><strong className="nl-amt">{fmt(average)}</strong> {name ? `of ${per} in ${name} on average, over ${months} ${months === 1 ? "year" : "years"}` : `of ${per} a month on average, over ${months} ${months === 1 ? "month" : "months"}`}</>}
      </p>
      <ul className="xbars years" aria-label={name ? `${MEASURES[m]} in ${name}, year by year` : `${MEASURES[m]} in an average month, year by year`}>
        {rows.map((r, i) => (
          <li key={r.year} style={{ "--i": i } as React.CSSProperties}>
            <button type="button" className={`xbar${r.partial ? " is-partial" : ""}`} onClick={() => setPicked(r.year)}
              title={r.partial ? "Still running: not in the average" : name ? undefined : `Average of ${r.months} ${r.months === 1 ? "month" : "months"}`}>
              <span className="xbar-label">{r.label}</span>
              <span className="xbar-track">
                <span className="xbar-fill" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: m === "income" ? "var(--series-income)" : "var(--series-spend)" }} />
                {months > 0 && <span className="xbar-was" style={{ left: `${(Math.abs(average) / max) * 100}%` }} aria-hidden />}
              </span>
              <span className="xbar-value nl-amt">{fmt(r.value)}{r.partial && <span className="caption"> so far</span>}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="explore-more">
        {months > 0 && <span className="caption"><span className="xbar-was-key" aria-hidden />Average</span>}
        {moved && <span className="caption">Rent sent early and pay that arrives ahead count in the month they’re for.</span>}
      </div>
      {row && createPortal(
        <SlotSheet title={name ? row.long : `${row.long}${row.partial ? ", so far" : ""}`} ctx={ctx} close={() => setPicked(null)} lines={row.lines.filter(countedBy(m))} />, document.body)}
    </>
  );
}

/** Groups × time, one hue: where and when the money went. */
function Heat({ inA, a, g, m, firstLoaded, ctx }: { inA: ExploreLine[]; a: Window; g: GroupKey; m: MeasureKey; firstLoaded: string; ctx: Ctx }) {
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  const slots = slotsOf(a, firstLoaded);
  if (slots.length < 2) return <p className="empty">Pick a longer date range for a heatmap.</p>;
  const rows = groupBy(inA, g, m).sort((x, y) => y.value - x.value).slice(0, 12);
  const grid = rows.map((r) => {
    const mine = inA.filter((l) => groupBy([l], g, m)[0]?.key === r.key);
    return { bucket: r.label, total: r.value, values: seriesOf(mine, slots, m), lines: mine };
  });
  // a square opens its transactions: that group, in that slot, the ones the measure counts
  const cell = picked && grid[picked.row] && slots[picked.col];
  return <>
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
  const [state, act, saving] = useActionState(async (_: FormState, form: FormData) => saveView(String(form.get("name") ?? ""), query), null);
  const path = usePathname();
  return (
    <div className="saved">
      {saved.length > 0 && (
        <ul className="chip-row saved-list" aria-label="Saved views">
          {saved.map((v) => (
            <li key={v.id} className="qchip qchip-saved">
              <a href={`${path}?${v.query}`}>{v.name}</a>
              <button type="button" aria-label={`Delete ${v.name}`} onClick={() => deleteView(v.id)}><X size={13} strokeWidth={2.25} /></button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bookmark size={16} strokeWidth={1.75} aria-hidden />Save view
      </button>
      {open && (
        <form action={act} className="save-form">
          <input className="input" name="name" placeholder="Name, e.g. Baby costs 2025" required maxLength={60} autoFocus />
          <button className="nl-btn nl-btn-md nl-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
          {state?.ok && <p className="msg msg-ok" role="status">{state.ok}</p>}
        </form>
      )}
    </div>
  );
}
