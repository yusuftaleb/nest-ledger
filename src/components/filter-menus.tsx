"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { RangePicker } from "./date-picker";
import { Menu, type Option } from "./menu";
import { parseSearch, withoutChip, type Chip, type SearchContext } from "@/lib/search";
import { bucketMenu } from "@/lib/buckets";

const CUSTOM = "\u0000custom";
const iso = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

type Ctx = Omit<SearchContext, "today" | "buckets"> & { buckets: { id: string; name: string; parent_id: string | null; kind?: string; icon?: string | null; color?: string | null }[] };

/**
 * Bucket, account, person and date dropdowns that read and write the search text, so the chips and the
 * menus always agree: picking "Groceries" adds the word, unticking it removes that chip.
 */
type Props = {
  q: string; setQ: (q: string) => void; ctx: Ctx; today: Date; earliest?: string | null;
  /** What no date filter means on this page: "Any time" in Activity, "Last 12 months" in Analysis. */
  defaultDates?: string;
};

/**
 * The filters as a row of menus on a wide screen; on a phone, one Filters button (with how many are on)
 * that opens them in a sheet, so they don't stack down the whole screen.
 */
export function FilterBar(props: Props) {
  const [open, setOpen] = useState(false);
  const full = useMemo(() => ({ ...props.ctx, today: props.today }), [props.ctx, props.today]);
  const on = useMemo(() => parseSearch(props.q, full).chips.filter((c) => c.kind !== "text").length, [props.q, full]);
  return (
    <>
      <div className="filter-inline"><FilterMenus {...props} /></div>
      <button type="button" className={`menu-button filter-open${on ? " is-set" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden />Filters{on > 0 && <span className="filter-count">{on}</span>}
      </button>
      {open && createPortal(<FilterSheet {...props} close={() => setOpen(false)} />, document.body)}
    </>
  );
}

function FilterSheet({ close, ...props }: Props & { close: () => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".menu-pop, .date-pop, .date-custom")) close(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; before?.focus({ preventScroll: true }); };
  }, [close]);
  return (
    <div className="peek-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="peek filter-sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={box} tabIndex={-1}>
        <header className="sheet-head">
          <h2 className="heading" id={id}>Filters</h2>
          <button type="button" className="icon-btn peek-btn" onClick={close} aria-label="Close"><X size={18} strokeWidth={1.75} /></button>
        </header>
        <div className="peek-body"><FilterMenus {...props} sheet /></div>
        <footer className="sheet-foot">
          <button type="button" className="nl-btn nl-btn-md nl-btn-ghost" disabled={!props.q.trim()} onClick={() => props.setQ("")}>Clear all</button>
          <button type="button" className="nl-btn nl-btn-md nl-btn-primary" onClick={close}>Done</button>
        </footer>
      </div>
    </div>
  );
}

export function FilterMenus({ q, setQ, ctx, today, earliest, defaultDates = "Any time", sheet }: Props & {
  /** Labelled full-width fields that open in place, for the phone's sheet. */
  sheet?: boolean;
}) {
  const id = useId();
  const full = useMemo(() => ({ ...ctx, today }), [ctx, today]);
  const { slice, chips } = useMemo(() => parseSearch(q, full), [q, full]);
  const chipFor = (kind: Chip["kind"], test: (c: Chip) => boolean) => chips.find((c) => c.kind === kind && test(c));
  const toggle = (kind: "bucket" | "account" | "person" | "kind" | "flag", id: string, words: string) => {
    const key = ({ bucket: "buckets", account: "accounts", person: "people", kind: "kinds", flag: "flags" } as const)[kind];
    const chip = chipFor(kind, (c) => parseSearch(c.token, full).slice[key].includes(id));
    setQ(chip ? withoutChip(q, chip) : `${q.trim()} ${words}`.trim());
  };

  const bucketOptions: Option[] = bucketMenu(ctx.buckets);
  const dateChip = chips.find((c) => c.kind === "date");
  const years: Option[] = [];
  const first = earliest ? Number(earliest.slice(0, 4)) : today.getFullYear() - 2;
  for (let y = today.getFullYear(); y >= first; y--) years.push({ value: String(y), label: String(y), group: "Year" });
  const dateOptions: Option[] = [
    { value: "", label: defaultDates },
    { value: "all time", label: "All time" },
    ...["this month", "last month", "this quarter", "last quarter", "this year", "last year", "last 12 months"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), group: "Recent" })),
    ...years,
    { value: CUSTOM, label: "Custom range…", group: "Pick dates" },
  ];
  const amountChip = chips.find((c) => c.kind === "amount");
  const amountOptions: Option[] = [
    { value: "", label: "Any" },
    { value: "under $20", label: "Under $20" }, { value: "$20-$100", label: "$20 to $100" },
    { value: "$100-$500", label: "$100 to $500" }, { value: "over $500", label: "Over $500" },
  ];
  const pickAmount = (v: string) => {
    const base = amountChip ? withoutChip(q, amountChip) : q;
    setQ(`${base.trim()} ${v}`.trim());
  };
  const TYPES: [string, string, string][] = [["spend", "Spending", "spending"], ["income", "Money in", "income"], ["transfer", "Transfers", "transfers"], ["refund", "Refunds", "refunds"], ["lent", "Lent", "lent"]];
  const STATUS: [string, string, string][] = [["review", "Needs a look", "needs review"], ["split", "Split across buckets", "split"], ["unverified", "Not matched to a statement", "unverified"], ["foreign", "Foreign currency", "foreign"]];
  const [custom, setCustom] = useState(false);
  const pickDate = (v: string) => {
    if (v === CUSTOM) { setCustom(true); return; }
    setCustom(false);
    const base = dateChip ? withoutChip(q, dateChip) : q;
    setQ(`${base.trim()} ${v}`.trim());
  };

  // a menu with its label inside the button, or, in the sheet, a labelled field above a full-width one
  const field = (label: string, menu: React.ComponentProps<typeof Menu>) => sheet ? (
    <div className="field menu-field" key={label}>
      <span id={`${id}-${label}`}>{label}</span>
      <Menu {...menu} labelledBy={`${id}-${label}`} inline />
    </div>
  ) : <Menu key={label} label={label} {...menu} />;

  return (
    <div className={sheet ? "filter-fields" : "filter-menus"} role="group" aria-label="Filters">
      <div className="date-filter">
        {field("Dates", {
          value: dateChip ? dateChip.token : "", onChange: pickDate, placeholder: defaultDates,
          options: dateChip && !dateOptions.some((o) => o.value === dateChip.token) ? [{ value: dateChip.token, label: dateChip.label }, ...dateOptions] : dateOptions,
        })}
        {custom && <CustomRange from={slice.from} to={slice.to} today={today} inline={sheet} onCancel={() => setCustom(false)} onApply={(a, b) => pickDate(`${a} to ${b}`)} />}
      </div>
      {field("Bucket", { multiple: true, values: slice.buckets, options: bucketOptions, onToggle: (id) => toggle("bucket", id, ctx.buckets.find((b) => b.id === id)!.name) })}
      {field("Account", {
        multiple: true, values: slice.accounts, options: ctx.accounts.map((a) => ({ value: a.id, label: a.name })),
        onToggle: (id) => toggle("account", id, ctx.accounts.find((a) => a.id === id)!.name),
      })}
      {ctx.members.length > 1 && field("Person", {
        multiple: true, values: slice.people,
        options: ctx.members.map((m) => ({ value: m.user_id, label: m.user_id === ctx.userId ? `${m.display_name} (you)` : m.display_name })),
        onToggle: (id) => toggle("person", id, `by ${ctx.members.find((m) => m.user_id === id)!.display_name.split(" ")[0]}`),
      })}
      {field("Type", { multiple: true, values: slice.kinds, options: TYPES.map(([value, label]) => ({ value, label })), onToggle: (k) => toggle("kind", k, TYPES.find((t) => t[0] === k)![2]) })}
      {field("Amount", {
        value: amountChip?.token ?? "", placeholder: "Any", onChange: pickAmount,
        options: amountChip && !amountOptions.some((o) => o.value === amountChip.token) ? [{ value: amountChip.token, label: amountChip.label }, ...amountOptions] : amountOptions,
      })}
      {field("Status", { multiple: true, values: slice.flags, options: STATUS.map(([value, label]) => ({ value, label })), onToggle: (f) => toggle("flag", f, STATUS.find((t) => t[0] === f)![2]) })}
      {!sheet && q.trim() && <button type="button" className="textlink filter-clear" onClick={() => setQ("")}>Clear all</button>}
    </div>
  );
}

/**
 * Two dates in a small floating calendar, opening on `from` up to `to` (exclusive; shown inclusive). `onApply`
 * gets both days inclusive. The Dates menu writes them into the search as "2026-07-01 to 2026-10-15", so the chip,
 * the menu and a typed span all mean the same thing.
 */
export function CustomRange({ from, to, today, inline, label = "Custom dates", onApply, onCancel }: {
  from?: string; to?: string; today: Date; inline?: boolean; label?: string; onApply: (from: string, last: string) => void; onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const last = to ? (([y, m, d]) => iso(new Date(y, m - 1, d - 1)))(to.split("-").map(Number)) : iso(today);
  const cancel = useRef(onCancel);
  useEffect(() => { cancel.current = onCancel; });
  useEffect(() => {
    if (inline) return;
    const away = (e: PointerEvent) => { if (!box.current?.parentElement?.contains(e.target as Node)) cancel.current(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [inline]);
  return (
    <div ref={box} role="dialog" className={`date-custom${inline ? " is-inline" : ""}`} aria-label={label}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } }}>
      <RangePicker from={from && from > "1900-01-01" ? from : iso(new Date(today.getFullYear(), today.getMonth(), 1))} to={last} max={iso(today)}
        onApply={onApply} onCancel={onCancel} />
    </div>
  );
}
