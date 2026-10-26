"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// hand-written so every browser says "Sep", never "Sept." or a locale's own order
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso: string, n: number) => { const d = dateOf(iso); return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const addMonths = (iso: string, n: number) => {
  const d = dateOf(iso), first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return isoOf(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last)));
};
const todayIso = () => isoOf(new Date());

/** "Oct 25, 2026". */
export function formatDay(iso: string) {
  const d = dateOf(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

/** What people type: 2026-10-05, Oct 5, 5 October 2026, 10/5/2026, today, yesterday. Null when it isn't a date. */
export function readDay(text: string, today = new Date()): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t === "today") return isoOf(today);
  if (t === "yesterday") return addDays(isoOf(today), -1);
  if (t === "tomorrow") return addDays(isoOf(today), 1);
  const made = (y: number, m: number, d: number) => {
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? isoOf(date) : null;
  };
  const year = (s?: string) => (!s ? today.getFullYear() : s.length === 2 ? 2000 + Number(s) : Number(s));
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return made(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/); // month first, as in Canada and the US
  if (m) return made(year(m[3]), +m[1], +m[2]);
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name.slice(0, 3).toLowerCase()}`).test(t));
  if (month < 0) return null;
  const nums = t.match(/\d+/g) ?? [];
  const day = nums.find((n) => n.length <= 2), y = nums.find((n) => n.length === 4);
  return day ? made(year(y), month + 1, Number(day)) : null;
}

/**
 * Notion's date picker: a field showing the date, opening a small calendar with the date written out on top
 * (type into it, or pick), a month you step through, a Today button and Clear. Arrow keys move by day and
 * week, Page Up and Down by month, Enter picks, Escape closes. Give `name` to send the date with a form.
 */
export function DateField({ value, defaultValue = "", onChange, name, max, min, placeholder = "Pick a date", clearable, variant = "field", labelledBy, label }: {
  value?: string; defaultValue?: string; onChange?: (iso: string) => void; name?: string; max?: string; min?: string;
  placeholder?: string; clearable?: boolean;
  /** "prop" sits quietly in a property row, like the add peek's; "field" looks like the app's other boxes. */
  variant?: "field" | "prop";
  labelledBy?: string; label?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const day = value ?? own;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const set = (iso: string) => { setOwn(iso); onChange?.(iso); };
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  // The calendar sits in the browser's top layer, so a short peek or a card can never cut it off. It hangs
  // under the field, or over it when there's more room there, and follows the field when the page scrolls.
  useLayoutEffect(() => {
    const el = pop.current, at = button.current;
    if (!open || !el || !at) return;
    el.showPopover?.();
    const place = () => {
      const b = at.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, gap = 6, edge = 8;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const below = vh - b.bottom - gap - edge, above = b.top - gap - edge;
      const up = h > below && above > below;
      el.toggleAttribute("data-up", up);
      const top = up ? Math.max(edge, b.top - gap - h) : Math.min(b.bottom + gap, vh - edge - h);
      el.style.top = `${Math.max(edge, top)}px`;
      el.style.left = `${Math.max(edge, Math.min(b.left, vw - edge - w))}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  return (
    <div ref={root} className={`date-pick date-pick-${variant}`}>
      {name && <input type="hidden" name={name} value={day} />}
      <button ref={button} id={id} type="button" className={variant === "prop" ? "date-trigger prop-input" : "date-trigger input"}
        aria-haspopup="dialog" aria-expanded={open} aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        aria-label={labelledBy ? undefined : label ? `${label}: ${day ? formatDay(day) : "none"}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        {variant === "field" && <CalendarDays size={16} strokeWidth={1.75} aria-hidden />}
        <span className={day ? undefined : "date-placeholder"}>{day ? formatDay(day) : placeholder}</span>
      </button>
      {open && (
        <div ref={pop} popover="manual" className="date-pop" role="dialog" aria-label={label ?? "Choose a date"}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
          <Calendar start={day || null} max={max} min={min} onPick={(iso) => { set(iso); close(); }} />
          {clearable && day && (
            <div className="cal-foot"><button type="button" className="cal-link" onClick={() => { set(""); close(); }}>Clear</button></div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Two dates on one calendar, Notion's "End date" way: the first pick is the start, the second the end
 * (picked before the start, they swap). Both are written out on top and can be typed. `to` is inclusive.
 */
export function RangePicker({ from, to, max, onApply, onCancel }: {
  from: string; to: string; max?: string; onApply: (from: string, to: string) => void; onCancel: () => void;
}) {
  const [a, setA] = useState(from);
  const [b, setB] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  const editing = b === null ? "end" : "start";
  const pick = (iso: string) => {
    if (b !== null) { setA(iso); setB(null); return; } // a fresh start; the next pick ends it
    if (iso < a) { setB(a); setA(iso); } else setB(iso);
    setHover(null);
  };
  return (
    <div className="cal-range">
      <div className="cal-ends">
        <DayInput label="Start" value={a} max={max} active={editing === "start"} onValue={(iso) => { setA(iso); if (b && iso > b) setB(iso); }} />
        <DayInput label="End" value={b ?? ""} placeholder="Pick a day" max={max} active={editing === "end"}
          onValue={(iso) => { if (iso < a) { setB(a); setA(iso); } else setB(iso); }} />
      </div>
      <Calendar start={a} end={b ?? (hover && hover >= a ? hover : null)} max={max} onPick={pick} onHover={b === null ? setHover : undefined} noInput />
      <div className="cal-foot">
        <span className="cal-note">{b === null ? "Now pick the last day" : ""}</span>
        <span className="cal-actions">
          <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="nl-btn nl-btn-sm nl-btn-primary" onClick={() => onApply(a, b ?? a)}>Apply</button>
        </span>
      </div>
    </div>
  );
}

/** A date written out, editable: Enter or leaving the box reads it; anything unreadable goes back. */
function DayInput({ label, value, placeholder, max, min, active, onValue }: {
  label?: string; value: string; placeholder?: string; max?: string; min?: string; active?: boolean; onValue: (iso: string) => void;
}) {
  const shown = value ? formatDay(value) : "";
  const [text, setText] = useState(shown);
  const [was, setWas] = useState(shown);
  if (shown !== was) { setWas(shown); setText(shown); }
  const read = () => {
    const iso = readDay(text);
    if (iso && (!max || iso <= max) && (!min || iso >= min)) { if (iso !== value) onValue(iso); setText(formatDay(iso)); }
    else setText(shown);
  };
  return (
    <label className={`cal-input${active ? " is-active" : ""}`}>
      {label && <span>{label}</span>}
      <input value={text} placeholder={placeholder ?? "Type a date"} onChange={(e) => setText(e.target.value)} onBlur={read}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(); } }} autoComplete="off" spellCheck={false} />
    </label>
  );
}

function Calendar({ start, end, max, min, onPick, onHover, noInput }: {
  start: string | null; end?: string | null; max?: string; min?: string; onPick: (iso: string) => void;
  onHover?: (iso: string | null) => void; noInput?: boolean;
}) {
  const today = todayIso();
  const [focus, setFocus] = useState(start ?? (max && max < today ? max : today));
  const [month, setMonth] = useState(focus.slice(0, 7));
  const keyed = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const allowed = (iso: string) => (!max || iso <= max) && (!min || iso >= min);

  // open on the chosen day, so the keyboard starts there (and a phone doesn't raise its keyboard)
  useEffect(() => { grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }, [focus]);

  const go = (iso: string) => { keyed.current = true; setFocus(iso); setMonth(iso.slice(0, 7)); };
  const first = dateOf(`${month}-01`);
  const lead = first.getDay();
  const cells = Array.from({ length: 42 }, (_, i) => isoOf(new Date(first.getFullYear(), first.getMonth(), 1 - lead + i)));
  // five rows when the month fits, so the popover doesn't carry an empty week
  const days = cells.slice(0, cells[35].slice(0, 7) === month ? 42 : 35);
  const tabbed = days.includes(focus) && focus.slice(0, 7) === month ? focus : `${month}-01`;
  const step = (n: number) => { const m = addMonths(`${month}-01`, n).slice(0, 7); setMonth(m); setFocus(`${m}-01`); };
  const lo = start && end ? (start < end ? start : end) : null, hi = start && end ? (start < end ? end : start) : null;

  return (
    <div className="calendar">
      {!noInput && <DayInput value={start ?? ""} max={max} min={min} onValue={onPick} />}
      <div className="cal-head">
        <span className="cal-title" aria-live="polite">{MONTHS[first.getMonth()]} {first.getFullYear()}</span>
        {allowed(today) && <button type="button" className="cal-link" onClick={() => onPick(today)}>Today</button>}
        <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft size={16} strokeWidth={2} /></button>
        <button type="button" className="cal-nav" aria-label="Next month" onClick={() => step(1)}
          disabled={!!max && `${addMonths(`${month}-01`, 1).slice(0, 7)}-01` > max}><ChevronRight size={16} strokeWidth={2} /></button>
      </div>
      <div ref={grid} className="cal-grid" role="grid" aria-label={`${MONTHS[first.getMonth()]} ${first.getFullYear()}`}
        onPointerLeave={() => onHover?.(null)}
        onKeyDown={(e) => {
          const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          let next: string | null = null;
          if (by[e.key]) next = addDays(tabbed, by[e.key]);
          else if (e.key === "PageUp") next = addMonths(tabbed, e.shiftKey ? -12 : -1);
          else if (e.key === "PageDown") next = addMonths(tabbed, e.shiftKey ? 12 : 1);
          else if (e.key === "Home") next = addDays(tabbed, -dateOf(tabbed).getDay());
          else if (e.key === "End") next = addDays(tabbed, 6 - dateOf(tabbed).getDay());
          if (!next) return;
          e.preventDefault();
          if (max && next > max) next = max;
          if (min && next < min) next = min;
          go(next);
          onHover?.(next);
        }}>
        <div role="row" className="cal-week">{WEEK.map((w) => <span key={w} role="columnheader" className="cal-dow">{w}</span>)}</div>
        {Array.from({ length: days.length / 7 }, (_, r) => (
          <div key={r} role="row" className="cal-week">
            {days.slice(r * 7, r * 7 + 7).map((iso) => {
              const d = dateOf(iso);
              const chosen = iso === start || iso === end;
              const cls = ["cal-day",
                iso.slice(0, 7) !== month && "is-out",
                iso === today && "is-today",
                chosen && "is-sel",
                lo && hi && iso > lo && iso < hi && "is-in",
                lo && hi && lo !== hi && iso === lo && "is-lo",
                lo && hi && lo !== hi && iso === hi && "is-hi"].filter(Boolean).join(" ");
              return (
                <span key={iso} role="gridcell" aria-selected={chosen}>
                  <button type="button" className={cls} tabIndex={iso === tabbed ? 0 : -1} disabled={!allowed(iso)}
                    aria-label={`${formatDay(iso)}${iso === today ? ", today" : ""}`} aria-current={iso === today ? "date" : undefined}
                    onClick={() => { setFocus(iso); onPick(iso); }} onPointerEnter={() => onHover?.(iso)}>
                    {d.getDate()}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
