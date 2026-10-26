"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Search, X } from "lucide-react";
import { FilterBar } from "./filter-menus";
import { Menu, type Option } from "./menu";
import { deleteView, saveView, type FormState } from "@/lib/actions";
import { parseSearch, withoutChip, type SearchContext } from "@/lib/search";

type Props = {
  ctx: Omit<SearchContext, "today" | "buckets"> & { buckets: { id: string; name: string; parent_id: string | null; kind?: string }[] };
  today: string; earliest?: string | null; placeholder?: string;
  sort?: { value: string; options: Option[] };
  /** Saved searches (Activity): one tap reopens them; the current search can be saved under a name. */
  saved?: { id: string; name: string; query: string }[];
};

/**
 * Smart search: shows what it understood as chips while you type, and updates the page a moment after you
 * stop (or at once on Enter). Everything else in the URL (sort, view) is kept.
 */
export function SearchBox({ ctx, today: todayIso, earliest, placeholder = "Search: tims over $10 last month", sort, saved }: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const today = useMemo(() => new Date(`${todayIso}T12:00`), [todayIso]);
  const { chips } = useMemo(() => parseSearch(q, { ...ctx, today }), [q, ctx, today]);

  const go = (next: string, patch: Record<string, string | null> = {}) => {
    clearTimeout(timer.current);
    const p = new URLSearchParams(params.toString());
    if (next.trim()) p.set("q", next.trim()); else p.delete("q");
    p.delete("limit");
    for (const [k, v] of Object.entries(patch)) if (v) p.set(k, v); else p.delete(k);
    start(() => router.replace(`${path}${p.toString() ? `?${p}` : ""}`, { scroll: false }));
  };
  const type = (next: string) => {
    setQ(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go(next), 350);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // "/" pressed on a page without a search box comes here and starts typing
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { if (sessionStorage.getItem("nl-focus-search")) { sessionStorage.removeItem("nl-focus-search"); field.current?.focus(); } } catch {}
  }, []);

  return (
    <div className="smart-search" data-pending={pending || undefined}>
      <form role="search" className="search" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <Search size={18} strokeWidth={1.75} className="nl-icon" aria-hidden />
        <input ref={field} className="input" name="q" type="search" value={q} onChange={(e) => type(e.target.value)}
          placeholder={placeholder} aria-label="Search transactions" autoComplete="off" spellCheck={false} />
        {q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQ(""); go(""); }}><X size={16} strokeWidth={2} /></button>}
      </form>
      <div className="filter-row">
        <FilterBar q={q} setQ={(next) => { setQ(next); go(next); }} ctx={ctx} today={today} earliest={earliest} />
        <div className="filter-end">
          {saved && <SavedSearches q={q} saved={saved} />}
          {sort && <Menu label="Sort" value={sort.value} options={sort.options} align="end" onChange={(v) => go(q, { sort: v === "newest" ? null : v })} />}
        </div>
      </div>
      {chips.length > 0 && (
        <ul className="chip-row" aria-label="Understood as">
          {chips.map((c, i) => (
            <li key={`${c.kind}-${c.token}-${i}`} className={`qchip qchip-${c.kind}`}>
              {c.label}
              <button type="button" aria-label={`Remove ${c.label}`} onClick={() => { const next = withoutChip(q, c); setQ(next); go(next); }}>
                <X size={13} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedSearches({ q, saved }: { q: string; saved: { id: string; name: string; query: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(async (_: FormState, form: FormData) =>
    saveView(String(form.get("name") ?? ""), q.trim() ? `q=${encodeURIComponent(q.trim())}` : "", "activity"), null);
  return (
    <div className="saved saved-searches">
      {saved.map((v) => (
        <span key={v.id} className="qchip qchip-saved">
          <a href={`/transactions?${v.query}`}>{v.name}</a>
          <button type="button" aria-label={`Delete ${v.name}`} onClick={() => deleteView(v.id)}><X size={13} strokeWidth={2.25} /></button>
        </span>
      ))}
      {q.trim() && (
        <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Bookmark size={16} strokeWidth={1.75} aria-hidden />Save search
        </button>
      )}
      {open && q.trim() && (
        <form action={act} className="save-form">
          <input className="input" name="name" placeholder="Name, e.g. Costco this year" required maxLength={60} autoFocus />
          <button className="nl-btn nl-btn-md nl-btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
          {state?.ok && <p className="msg msg-ok" role="status">{state.ok}</p>}
        </form>
      )}
    </div>
  );
}
