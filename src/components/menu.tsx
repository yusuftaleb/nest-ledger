"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { CategoryIcon } from "./icons";

// on a phone, focusing the search would bring up the keyboard over the list you came to tap
const touch = () => typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;

export type Option = {
  value: string; label: string; hint?: string; group?: string;
  /** The option this one sits inside: the menu shows it only after you open its parent. */
  parent?: string;
  /** The name to show once inside the parent ("Diapers & wipes" rather than "Baby › Diapers & wipes"). */
  short?: string;
  /** A bucket's icon; `seed` keeps its color steady when it has none. */
  icon?: string | null; color?: string | null; seed?: string;
};

/**
 * A Notion-style dropdown: a quiet button showing the label and current value, opening a small menu with a
 * checkmark on the chosen option. Arrow keys move, Enter picks, Escape closes, typing searches long lists.
 * `multiple` keeps the menu open and toggles options. Options with a `parent` stay tucked inside it: picking
 * the parent opens it (→ and ← also step in and out), and search still finds everything at once.
 */
export function Menu({ label, value, values, options, onChange, onToggle, multiple, placeholder = "Any", align = "start", compact, labelledBy, inline, icon }: {
  label?: string; value?: string; values?: string[]; options: Option[]; placeholder?: string; align?: "start" | "end"; compact?: boolean;
  /** Open in place, pushing what's below down, rather than floating (inside a sheet that scrolls). */
  inline?: boolean;
  /** An icon before the label, for a menu that sits among buttons. */
  icon?: React.ReactNode;
  /** The id of a visible label outside the button (forms). */
  labelledBy?: string;
  onChange?: (value: string) => void; onToggle?: (value: string) => void; multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [inside, setInside] = useState<string | null>(null); // the parent that's open
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const chosen = multiple ? values ?? [] : value !== undefined ? [value] : [];
  const searchable = options.length > 7;

  // what sits inside what; an option whose parent isn't in the list stays at the top
  const { kids, top } = useMemo(() => {
    const here = new Set(options.map((o) => o.value));
    const kids = new Map<string, Option[]>();
    const top: Option[] = [];
    for (const o of options) {
      if (o.parent && here.has(o.parent)) kids.set(o.parent, [...(kids.get(o.parent) ?? []), o]);
      else top.push(o);
    }
    return { kids, top };
  }, [options]);
  const listFor = (at: string | null) => {
    const parent = at ? options.find((o) => o.value === at) : undefined;
    return parent ? [parent, ...(kids.get(parent.value) ?? [])] : top;
  };

  // every word must appear somewhere (name, parent, group or hint), so "baby dia" finds "Baby › Diapers";
  // names that start with what you typed come first
  const searching = query.trim() !== "";
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      const parent = inside ? options.find((o) => o.value === inside) : undefined;
      return parent ? [parent, ...(kids.get(parent.value) ?? [])] : top;
    }
    const rank = (o: Option) => {
      const name = o.label.toLowerCase(), leaf = name.split(" › ").at(-1)!;
      return leaf.startsWith(words[0]) ? 0 : name.startsWith(words[0]) ? 1 : name.split(/[\s›&/]+/).some((w) => w.startsWith(words[0])) ? 2 : 3;
    };
    return options
      .filter((o) => { const hay = `${o.label} ${o.group ?? ""} ${o.hint ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
      .map((o, i) => ({ o, i, r: rank(o) })).sort((a, b) => a.r - b.r || a.i - b.i).map(({ o }) => o);
  }, [options, query, inside, kids, top]);
  const opened = !searching && inside !== null; // showing one parent and what's inside it

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  // Keep the menu in view: open upward when there's more room above (the bulk bar sits at the bottom),
  // and flip to the other edge when it would run past a side. "In view" is the window, or the scrolling box
  // the menu sits in (the peek), whichever is tighter, so a peek's edge never cuts the list off.
  useLayoutEffect(() => {
    const el = pop.current, button = root.current;
    if (!open || !el || !button) return;
    el.querySelector<HTMLInputElement>(".menu-search input:not([data-touch])")?.focus({ preventScroll: true });
    if (inline) { el.scrollIntoView({ block: "nearest" }); return; }
    const box = clipBox(button);
    const b = button.getBoundingClientRect(), gap = 8;
    const below = box.bottom - b.bottom - gap, above = b.top - box.top - gap;
    const up = el.offsetHeight > below && above > below;
    if (up) el.dataset.up = ""; else delete el.dataset.up;
    if (list.current) list.current.style.maxHeight = `${Math.max(120, Math.min(320, (up ? above : below) - 60))}px`;
    delete el.dataset.flip;
    const r = el.getBoundingClientRect();
    if (r.right > box.right - gap || r.left < box.left + gap) el.dataset.flip = "";
  }, [open, inline]);
  // keep the highlighted option in view by scrolling the list alone; scrollIntoView would also move the page
  useEffect(() => {
    const box = list.current, item = box?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!box || !item) return;
    const b = box.getBoundingClientRect(), r = item.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  }, [active, open]);

  const enter = (at: string | null, focus?: string) => {
    setInside(at);
    setActive(Math.max(0, focus ? listFor(at).findIndex((o) => o.value === focus) : 0));
  };
  const pick = (o: Option, i: number) => {
    // a parent at the top opens; once inside, the parent row picks the parent itself
    if (kids.has(o.value) && !(opened && i === 0)) { setQuery(""); enter(o.value); return; }
    if (multiple) onToggle?.(o.value);
    else { onChange?.(o.value); setOpen(false); }
  };
  const openMenu = () => {
    setQuery("");
    // open where the current choice lives, so changing Diapers to Formula is one click
    const current = !multiple ? options.find((o) => o.value === value) : undefined;
    const at = current?.parent && kids.has(current.parent) ? current.parent : null;
    setInside(at);
    const here = listFor(at);
    setActive(Math.max(0, here.findIndex((o) => chosen.includes(o.value))));
    setOpen(true);
  };
  const key = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); openMenu(); return; }
    if (!open) return;
    const o = shown[active];
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "ArrowRight" && !searching && !opened && o && kids.has(o.value)) { e.preventDefault(); enter(o.value); }
    else if (e.key === "ArrowLeft" && opened) { e.preventDefault(); enter(null, inside!); }
    else if (e.key === "Enter" && o) { e.preventDefault(); pick(o, active); }
  };
  const currentOption = !multiple ? options.find((o) => o.value === value) : chosen.length === 1 ? options.find((o) => o.value === chosen[0]) : undefined;
  const current = multiple
    ? chosen.length === 0 ? placeholder : chosen.length === 1 ? currentOption?.label ?? placeholder : `${chosen.length} chosen`
    : currentOption?.label ?? placeholder;
  const glyph = (o: Option) => o.seed !== undefined && <CategoryIcon small icon={o.icon} color={o.color} seed={o.seed} />;

  return (
    <div className={`menu${compact ? " menu-compact" : ""}${inline ? " menu-inline" : ""}`} ref={root} onKeyDown={key}>
      <button type="button" className={`menu-button${multiple && chosen.length ? " is-set" : ""}`} aria-haspopup="listbox" aria-expanded={open}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}-value` : undefined}
        aria-controls={id} onClick={() => (open ? setOpen(false) : openMenu())}>
        {icon}
        {label && <span className="menu-label">{label}</span>}
        {currentOption && glyph(currentOption)}
        <span className="menu-value" id={`${id}-value`}>{current}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className={`menu-pop ${align}`} ref={pop}>
          {searchable && (
            <label className="menu-search">
              <Search size={14} strokeWidth={2} aria-hidden />
              <input data-touch={touch() ? "" : undefined} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search" aria-label={`Search ${label ?? "options"}`} />
            </label>
          )}
          {opened && (
            <button type="button" className="menu-back" onClick={() => enter(null, inside!)}>
              <ChevronLeft size={15} strokeWidth={2} aria-hidden />Back
            </button>
          )}
          <ul className="menu-list" role="listbox" id={id} ref={list} aria-multiselectable={multiple || undefined} tabIndex={-1}>
            {shown.length === 0 && <li className="menu-empty">No matches</li>}
            {shown.map((o, i) => {
              // while searching, results are ranked rather than grouped, so the group moves to the right
              const head = !searching && !opened && o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
              const self = opened && i === 0; // the open parent itself, above what's inside it
              const folder = !searching && !opened && kids.has(o.value);
              const inner = folder ? kids.get(o.value)!.filter((k) => chosen.includes(k.value)).length : 0;
              const hint = folder ? (inner ? `${inner} chosen` : String(kids.get(o.value)!.length)) : o.hint ?? (searching ? o.group : undefined);
              const name = searching ? o.label : self ? (multiple ? `All of ${o.label}` : `Just ${o.label}`) : opened ? o.short ?? o.label : o.label;
              return (
                <li key={o.value} role="presentation">
                  {head && <span className="menu-group">{head}</span>}
                  <button type="button" role="option" aria-selected={chosen.includes(o.value)} data-i={i}
                    className={`menu-item${i === active ? " is-active" : ""}${opened && !self ? " is-inside" : ""}${self ? " is-self" : ""}`}
                    onMouseEnter={() => setActive(i)} onClick={() => pick(o, i)}>
                    <span className="menu-check">{chosen.includes(o.value) && <Check size={14} strokeWidth={2.25} />}</span>
                    <span className="menu-item-label">{glyph(o)}<span>{name}</span></span>
                    {(hint || folder) && (
                      <span className="menu-hint">{hint}{folder && <ChevronRight size={14} strokeWidth={2} aria-hidden />}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The visible area around an element: the window, narrowed by every scrolling or clipping box it sits in. */
function clipBox(node: HTMLElement) {
  const box = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const r = el.getBoundingClientRect();
    box.top = Math.max(box.top, r.top); box.bottom = Math.min(box.bottom, r.bottom);
    box.left = Math.max(box.left, r.left); box.right = Math.min(box.right, r.right);
  }
  return box;
}
