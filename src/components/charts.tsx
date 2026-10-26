import { LOCALE, weekdayIndex, weekdayNames } from "@/lib/format";
import { ChartTip } from "./chart-tip";
import { SeriesLegend } from "./series-legend";
import { formatCents, formatCompact } from "@/lib/money";

// Chart primitives drawn on the server as plain HTML/SVG. Marks follow one spec: bars at most 24px thick
// with a rounded data end, 2px lines, hairline grid, text in ink colors (never the series color),
// a legend whenever there are two series, and a "Show as table" twin for every chart.

export const money = (c: number) => formatCents(c, { sign: false });
/** $1,240 → "$1.2K" for axis ticks and tight labels. */
export const compact = formatCompact;
/** Round a maximum up to a clean axis value (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ), so a chart uses most of its height. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="chart-table">
      <summary>Show as table</summary>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "bar" | "line" }[] }) {
  return (
    <ul className="legend">
      {items.filter((i) => i.label).map((i, n) => (
        <li key={`${n}-${i.label}`}><span className={`legend-key ${i.kind ?? "bar"}`} style={{ background: i.color }} aria-hidden />{i.label}</li>
      ))}
    </ul>
  );
}

type Column = { key: string; label: string; value: number; tip: string; strong?: boolean; short?: string };

/** A column label: the full one, and a one-letter one for narrow cards with many columns. */
const Tick = ({ label, short }: { label: string; short?: string }) => (
  <span className="col-label"><span className="lbl-l">{label}</span><span className="lbl-s">{short ?? label}</span></span>
);

/**
 * Columns on a shared baseline with three gridlines. `strong` marks the column the story is about
 * (the current month); it gets the full series color and its value printed on the cap.
 */
/** A column that acts as a button when the chart offers picking. */
const pickable = (onPick: ((key: string) => void) | undefined, key: string) => onPick ? {
  role: "button", "data-pick": "",
  onClick: () => onPick(key),
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(key); } },
} : {};

export function Columns({ items, color = "var(--series-spend)", average, caption, onPick }: {
  items: Column[]; color?: string; average?: { value: number; label: string }; caption: string;
  /** Tapping a column picks it (Analysis opens that stretch's transactions). */
  onPick?: (key: string) => void;
}) {
  const max = niceMax(Math.max(...items.map((i) => i.value), average?.value ?? 0, 1));
  const ticks = [max, max / 2, 0];
  return (
    <figure className="cols-figure">
      <ChartTip>
        <div className={`cols${items.length > 8 ? " many" : ""}`} style={{ "--n": items.length } as React.CSSProperties}>
          <div className="cols-grid" aria-hidden>
            {ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}><em>{compact(t)}</em></span>)}
            {average && average.value > 0 && (
              <span className="cols-avg" style={{ bottom: `${(average.value / max) * 100}%` }}><em>{average.label}</em></span>
            )}
          </div>
          {items.map((i, n) => (
            <div key={i.key} className={`col${i.strong ? " strong" : ""}`} tabIndex={0} data-tip={i.tip} aria-label={i.tip}
              {...pickable(onPick, i.key)} style={{ "--i": n } as React.CSSProperties}>
              <div className="col-plot">
                {i.strong && i.value > 0 && <span className="col-value" style={{ bottom: `${(i.value / max) * 100}%` }}>{compact(i.value)}</span>}
                <span className="col-bar" style={{ height: `${(Math.max(i.value, 0) / max) * 100}%`, background: color }} />
              </div>
              <Tick label={i.label} short={i.short} />
            </div>
          ))}
        </div>
      </ChartTip>
      <ChartTable caption={caption} head={["", "Amount"]} rows={items.map((i) => [i.label, money(i.value)])} />
    </figure>
  );
}

/**
 * Two series per slot side by side: money in and money out (with the net under each pair) by default, or any
 * two series such as this period against an earlier one.
 */
export function PairedColumns({ items, caption, head = "month", series, net: showNet = true, onPick }: {
  items: { key: string; label: string; a: number; b: number; strong?: boolean; tip?: string; short?: string }[]; caption: string;
  /** What each column is, for the table's first heading: month, quarter or year. */
  head?: string;
  series?: { a: { label: string; color: string }; b: { label: string; color: string } }; net?: boolean;
  onPick?: (key: string) => void;
}) {
  const sa = series?.a ?? { label: "Money in", color: "var(--series-income)" }, sb = series?.b ?? { label: "Money out", color: "var(--series-spend)" };
  const max = niceMax(Math.max(...items.flatMap((i) => [i.a, i.b]), 1));
  const ticks = [max, max / 2, 0];
  return (
    <figure className="cols-figure">
      <Legend items={[{ label: sa.label, color: sa.color }, { label: sb.label, color: sb.color }]} />
      <ChartTip>
        <div className={`cols paired${items.length > 8 ? " dense many" : ""}`} style={{ "--n": items.length } as React.CSSProperties}>
          <div className="cols-grid" aria-hidden>
            {ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}><em>{compact(t)}</em></span>)}
          </div>
          {items.map((i, n) => {
            const net = i.a - i.b;
            const tip = i.tip ?? `${i.label}\nIn ${money(i.a)}\nOut ${money(i.b)}\nNet ${formatCents(net)}`;
            return (
              <div key={i.key} className={`col${i.strong ? " strong" : ""}`} tabIndex={0} data-tip={tip} aria-label={tip.replaceAll("\n", ", ")}
                {...pickable(onPick, i.key)} style={{ "--i": n } as React.CSSProperties}>
                <div className="col-plot pair">
                  <span className="col-bar" style={{ height: `${(Math.max(i.a, 0) / max) * 100}%`, background: sa.color }} />
                  <span className="col-bar" style={{ height: `${(Math.max(i.b, 0) / max) * 100}%`, background: sb.color }} />
                </div>
                <Tick label={i.label} short={i.short} />
                {showNet && <span className={`col-net ${net >= 0 ? "up" : "down"}`}>{net >= 0 ? "+" : "−"}{compact(Math.abs(net)).replace("−", "")}</span>}
              </div>
            );
          })}
        </div>
      </ChartTip>
      <ChartTable caption={caption} head={showNet ? [head[0].toUpperCase() + head.slice(1), sa.label, sb.label, "Net"] : ["", sa.label, sb.label]}
        rows={items.map((i) => (showNet ? [i.label, money(i.a), money(i.b), formatCents(i.a - i.b)] : [i.label, money(i.a), money(i.b)]))} />
    </figure>
  );
}

/**
 * Running totals across a month: this month (series color, solid) against last month (gray),
 * with an optional budget line. Lines are SVG; dots, labels and hit areas are HTML on top so they
 * stay round and crisp at any width.
 */
export function PaceChart({ now, before: lastPeriod, older: olderPeriods = [], days, budget, today, labels, axis }: {
  now: number[]; before: number[]; days: number; budget?: number; today: number; labels: { now: string; before: string };
  /** The same dates in the years before `before`, nearest first: each a fainter grey line. */
  older?: { label: string; values: number[] }[];
  /** Start, middle and end labels; day numbers when left out. */
  axis?: string[];
}) {
  // last month can be a day longer (31 against 30); draw it only as far as this month goes
  const before = lastPeriod.slice(0, days);
  const older = olderPeriods.map((o) => ({ ...o, values: o.values.slice(0, days) })).filter((o) => o.values.length > 0);
  // with several years, last year steps up from the faint grey so the years read nearest to furthest
  const yrs = older.length > 0;
  const max = niceMax(Math.max(...now, ...before, ...older.flatMap((o) => o.values), budget ?? 0, 1));
  const x = (d: number) => (d / Math.max(days - 1, 1)) * 100;
  const y = (v: number) => 100 - (v / max) * 100;
  const path = (s: number[]) => s.map((v, d) => `${d ? "L" : "M"}${x(d).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = now.length - 1;
  const ticks = [max, max / 2, 0];
  const hits = Array.from({ length: days }, (_, d) => {
    const parts = [`Day ${d + 1}`];
    if (d < now.length) parts.push(`${labels.now}: ${money(now[d])}`);
    if (d < before.length) parts.push(`${labels.before}: ${money(before[d])}`);
    for (const o of older) if (d < o.values.length) parts.push(`${o.label}: ${money(o.values[d])}`);
    return parts.join("\n");
  });
  return (
    <figure className="pace-figure">
      {/* tap a line's name to hide it, hold to see only it */}
      <SeriesLegend items={[
        { id: "s0", label: labels.now, color: "var(--series-spend)", kind: "line" },
        { id: "s1", label: before.length ? labels.before : "", color: yrs ? "var(--series-yr-1)" : "var(--series-prev)", kind: "line" },
        ...older.map((o, i) => ({ id: `s${i + 2}`, label: o.label, color: `var(--series-yr-${Math.min(i + 2, 3)})`, kind: "line" as const })),
        ...(budget ? [{ id: "b", label: "Budget", color: "var(--ink-muted)", kind: "line" as const }] : []),
      ]} />
      <ChartTip>
        <div className="pace">
          <div className="cols-grid" aria-hidden>
            {ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}><em>{compact(t)}</em></span>)}
            {budget ? <span className="cols-avg budget" data-s="b" style={{ bottom: `${(budget / max) * 100}%` }}><em>Budget {compact(budget)}</em></span> : null}
          </div>
          {/* three layers so each can arrive on its own: last period's line is drawn first, then this one, as a pen
              moving left to right; the shading settles in under it once it reaches today. This period's layer is only
              as wide as the line, so the pen reaches today exactly when the drawing ends. */}
          {last >= 0 && (
            <svg className="pace-svg pace-svg-area" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path d={`${path(now)} L${x(last)},100 L0,100 Z`} className="pace-area" data-s="s0" />
            </svg>
          )}
          {(before.length > 0 || yrs) && (
            <svg className="pace-svg pace-svg-prev" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {/* furthest back underneath, so the nearer years sit on top where lines cross */}
              {older.map((o, i) => <path key={o.label} d={path(o.values)} data-s={`s${i + 2}`} className={`pace-line prev yr-${Math.min(i + 2, 3)}`} />).reverse()}
              {before.length > 0 && <path d={path(before)} data-s="s1" className={`pace-line prev${yrs ? " yr-1" : ""}`} />}
            </svg>
          )}
          {last >= 0 && (
            <svg className="pace-svg pace-svg-now" viewBox={`0 0 ${Math.max(x(last), 0.01)} 100`} preserveAspectRatio="none"
              style={{ width: `${Math.max(x(last), 0.01)}%` }} aria-hidden>
              <path d={path(now)} className="pace-line now" data-s="s0" />
            </svg>
          )}
          {last >= 0 && (
            <span className="pace-dot" data-s="s0" style={{ left: `${x(last)}%`, top: `${y(now[last])}%` }} aria-hidden>
              <em className={x(last) > 70 ? "left" : ""}>{compact(now[last])}</em>
            </span>
          )}
          <div className="pace-hits">
            {hits.map((t, d) => <span key={d} data-tip={t} className={d === today - 1 ? "today" : ""} />)}
          </div>
        </div>
        <div className="pace-axis" aria-hidden>{(axis ?? ["1", String(Math.ceil(days / 2)), String(days)]).map((a, i) => <span key={i}>{a}</span>)}</div>
      </ChartTip>
      <ChartTable caption="Running total by day" head={["Day", labels.now, labels.before, ...older.map((o) => o.label)]}
        rows={Array.from({ length: days }, (_, d) => [d + 1, d < now.length ? money(now[d]) : "", d < before.length ? money(before[d]) : "",
          ...older.map((o) => (d < o.values.length ? money(o.values[d]) : ""))])} />
    </figure>
  );
}

/** Month grid, starting on the household's first weekday. Cell shade = that day's spending on one hue; no-spend days get a sprout. */
export function SpendCalendar({ monthStart, values, today, sprout }: {
  monthStart: string; values: number[]; today: number; sprout: React.ReactNode;
}) {
  const [y, m] = monthStart.split("-").map(Number);
  const lead = weekdayIndex(new Date(y, m - 1, 1));
  const sorted = values.slice(0, today).filter((v) => v > 0).sort((a, b) => a - b);
  // four bins from quartiles of the days so far, so one rent day doesn't wash out the rest
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const bin = (v: number) => (v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);
  const label = (d: number) => new Date(y, m - 1, d).toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric" });
  return (
    <figure className="cal-figure">
      <ChartTip>
        <div className="cal" role="grid" aria-label="Spending by day">
          {weekdayNames("narrow").map((d, i) => <span key={i} className="cal-head" aria-hidden>{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} aria-hidden />)}
          {values.map((v, i) => {
            const d = i + 1, future = d > today;
            const tip = future ? label(d) : `${label(d)}\n${v > 0 ? money(v) : "No spending"}`;
            return (
              <span key={d} role="gridcell" tabIndex={future ? -1 : 0} data-tip={tip} aria-label={tip.replace("\n", ": ")}
                className={`cal-day b${future ? "x" : bin(v)}${d === today ? " today" : ""}`}>
                <em>{d}</em>
                {!future && v <= 0 && sprout}
              </span>
            );
          })}
        </div>
      </ChartTip>
      <div className="cal-scale" aria-hidden>
        <span>Less</span>{[0, 1, 2, 3, 4].map((b) => <i key={b} className={`cal-day b${b}`} />)}<span>More</span>
      </div>
      <ChartTable caption="Spending by day" head={["Day", "Spent"]}
        rows={values.slice(0, today).map((v, i) => [label(i + 1), money(v)])} />
    </figure>
  );
}

/**
 * Columns that can go below zero: the share of income kept each month. Above the line is money kept
 * (income green), below it is spending past income (spending purple), with the average as a hairline.
 */
export function SignedColumns({ items, average, caption, head = "Month" }: {
  items: { key: string; label: string; value: number | null; tip: string; strong?: boolean; short?: string }[]; average: number | null; caption: string;
  /** The table's first heading: Month, Quarter or Year. */
  head?: string;
}) {
  // the scale stops at ±100%: a month with almost no income recorded can't flatten every other month
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const values = items.map((i) => clamp(i.value ?? 0));
  const top = Math.max(0.25, Math.ceil(Math.max(...values, 0) * 4) / 4);
  const bottom = Math.min(0, Math.floor(Math.min(...values, 0) * 4) / 4);
  const span = top - bottom;
  const at = (v: number) => ((v - bottom) / span) * 100;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const ticks = [...new Set([top, bottom < 0 ? 0 : top / 2, bottom])];
  return (
    <figure className="cols-figure">
      <Legend items={[{ label: "Kept", color: "var(--series-income)" }, { label: "Spent past income", color: "var(--series-spend)" }]} />
      <ChartTip>
        <div className={`cols signed${items.length > 8 ? " many" : ""}`} style={{ "--n": items.length } as React.CSSProperties}>
          <div className="cols-grid" aria-hidden>
            {ticks.map((t) => <span key={t} className={t === 0 ? "zero" : ""} style={{ bottom: `${at(t)}%` }}><em>{pct(t)}</em></span>)}
            {average !== null && <span className="cols-avg" style={{ bottom: `${at(average)}%` }}><em>Avg {pct(average)}</em></span>}
          </div>
          {items.map((i, n) => {
            const v = clamp(i.value ?? 0);
            return (
              <div key={i.key} className={`col${i.strong ? " strong" : ""}`} tabIndex={0} data-tip={i.tip} aria-label={i.tip.replaceAll("\n", ", ")}
                style={{ "--i": n } as React.CSSProperties}>
                <div className="col-plot">
                  {i.value !== null && (
                    <span className={`col-bar ${v < 0 ? "neg" : "pos"}`}
                      style={{ bottom: `${at(Math.min(v, 0))}%`, height: `${(Math.abs(v) / span) * 100}%` }} />
                  )}
                  {i.strong && i.value !== null && (
                    <span className="col-value" style={{ bottom: `${v >= 0 ? at(v) : at(0)}%` }}>{pct(i.value)}</span>
                  )}
                  {i.value === null && <span className="col-none" title="Too little income recorded">–</span>}
                </div>
                <Tick label={i.label} short={i.short} />
              </div>
            );
          })}
        </div>
      </ChartTip>
      <ChartTable caption={caption} head={[head, "Kept"]} rows={items.map((i) => [i.tip.split("\n")[0], i.value === null ? "Too little income recorded" : pct(i.value)])} />
    </figure>
  );
}

/**
 * Bucket × month heatmap, read as a table. Each row is shaded against its own busiest month, so rent and
 * gifts are both readable; the exact amount is in every cell's tooltip and the totals sit on the right.
 */
export function Matrix({ months, rows, current, onPick }: {
  months: { key: string; label: string; long: string }[]; rows: { bucket: string; values: number[]; total: number }[]; current: string;
  /** Opens a cell's transactions: the row and column picked. Only cells with money in them can be picked. */
  onPick?: (row: number, col: number) => void;
}) {
  // month columns carry just the month; the years sit in a band above, spanning their months
  const monthly = months.length > 0 && months.every((m) => /^\d{4}-\d{2}-01$/.test(m.key)) && (months.length < 2 || months[1].key.slice(8) === "01");
  const label = (m: { key: string; label: string }) => (monthly ? new Date(`${m.key}T12:00`).toLocaleDateString(LOCALE, { month: "short" }).replace(".", "") : m.label);
  const years: { year: string; span: number }[] = [];
  if (monthly) for (const m of months) { const y = m.key.slice(0, 4); if (years.at(-1)?.year === y) years.at(-1)!.span++; else years.push({ year: y, span: 1 }); }
  return (
    <ChartTip className="matrix-wrap">
      <table className="matrix" style={{ "--cols": months.length } as React.CSSProperties}>
        <caption className="sr-only">Spending by bucket and month</caption>
        <colgroup>
          <col className="matrix-col-name" />
          {months.map((m) => <col key={m.key} />)}
          <col className="matrix-col-sum" />
        </colgroup>
        <thead>
          {years.length > 1 && (
            <tr className="matrix-years">
              <th scope="col"><span className="sr-only">Year</span></th>
              {years.map((y) => <th key={y.year} scope="colgroup" colSpan={y.span}>{y.year}</th>)}
              <th aria-hidden />
            </tr>
          )}
          <tr>
            <th scope="col"><span className="sr-only">Bucket</span></th>
            {months.map((m) => <th key={m.key} scope="col" className={m.key === current ? "now" : ""} abbr={m.long}>{label(m)}</th>)}
            <th scope="col" className="matrix-sum">Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => {
            const max = Math.max(...r.values, 1);
            const filled = r.values.filter((v, i) => v > 0 && months[i].key !== current);
            return (
              <tr key={r.bucket} style={{ "--i": n } as React.CSSProperties}>
                <th scope="row">{r.bucket}</th>
                {r.values.map((v, i) => {
                  const tip = `${r.bucket}, ${months[i].long}\n${v > 0 ? money(v) : "Nothing"}`;
                  const level = v <= 0 ? 0 : Math.max(1, Math.round((v / max) * 5));
                  return (
                    <td key={months[i].key} className={months[i].key === current ? "now" : ""}>
                      {onPick && v > 0 ? (
                        <span className={`matrix-cell m${level}`} data-tip={tip} data-pick="" role="button" tabIndex={0}
                          aria-label={`${r.bucket}, ${months[i].long}: ${money(v)}. Show these transactions`}
                          onClick={() => onPick(n, i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(n, i); } }} />
                      ) : (
                        <span className={`matrix-cell m${level}`} data-tip={tip} tabIndex={-1}><span className="sr-only">{v > 0 ? money(v) : "Nothing"}</span></span>
                      )}
                    </td>
                  );
                })}
                <td className="matrix-sum nl-amt">{compact(filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ChartTip>
  );
}
