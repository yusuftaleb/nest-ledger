"use client";

import { useRef, useState, useTransition } from "react";
import { Check, CircleCheck, Flag, FolderInput, PencilLine, Trash2, X } from "lucide-react";
import { CollapseToggle } from "./collapse-toggle";
import { Menu, type Option } from "./menu";
import { showUndo } from "./undo";
import { bulkDelete, bulkUpdate, restoreEdits, restoreTransactions, type Before, type FormState, type Removed } from "@/lib/actions";
import { formatCents } from "@/lib/money";
/** A row as the server drew it (icons and all, so nothing loads late), plus what selection needs. */
export type BulkRow = { id: string; merchant: string; node: React.ReactNode };
export type MonthGroup = { key: string; label: string; count: number; out: number; in: number; rows: BulkRow[]; folded: boolean };

const money = (c: number) => formatCents(c, { sign: false });

/**
 * Activity's month groups, with selection: tick rows on their icon (Shift-click for a range), then set a
 * bucket, rename, mark as checked or needing a look, or delete, all at once.
 */
export function BulkActivity({ groups, bucketOptions }: { groups: MonthGroup[]; bucketOptions: Option[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [result, setResult] = useState<FormState>(null);
  const [pending, start] = useTransition();
  const last = useRef<string | null>(null);
  const order = groups.flatMap((g) => g.rows.map((r) => r.id));

  const toggle = (id: string, range: boolean) => {
    setResult(null);
    const from = last.current; // read now: the updater below runs later, after last.current has moved on
    setSelected((cur) => {
      const next = new Set(cur);
      if (range && from) {
        // Shift-click: everything between the last ticked row and this one takes this row's new state
        const [a, b] = [order.indexOf(from), order.indexOf(id)].sort((x, y) => x - y);
        const on = !cur.has(id);
        for (const x of order.slice(a, b + 1)) if (on) next.add(x); else next.delete(x);
      } else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    last.current = id;
  };
  // every change is made at once and said in the Undo bar; only a failure stays in the toolbar
  const run = (job: () => Promise<FormState & { before?: Before; removed?: Removed }>) => start(async () => {
    const r = await job();
    if (r?.ok) {
      setResult(null); setSelected(new Set()); setRenaming(false); setName("");
      const { before, removed } = r;
      showUndo(r.ok, removed ? () => restoreTransactions(removed) : before ? () => restoreEdits(before) : undefined);
    } else setResult(r);
  });
  const ids = [...selected];

  return (
    <>
      {groups.map((g) => {
        const id = `month-${g.key}`;
        return (
          <section key={g.key} className="month-group" aria-labelledby={`m-${g.key}`} data-collapsible data-collapsed={g.folded}>
            <header className="month-head-row">
              <h2 className="month-head" id={`m-${g.key}`}>{g.label}</h2>
              <span className="month-sum">
                <span>{g.count} {g.count === 1 ? "transaction" : "transactions"}</span>
                {(g.out > 0 || g.in > 0) && (
                  <span>
                    {g.out > 0 && <><span className="nl-amt">{money(g.out)}</span> out</>}
                    {g.out > 0 && g.in > 0 && " · "}
                    {g.in > 0 && <><span className="nl-amt in">{money(g.in)}</span> in</>}
                  </span>
                )}
              </span>
              <CollapseToggle id={id} label={g.label} collapsed={g.folded} remember={false} />
            </header>
            <div className="nl-card bulk-list">
              {g.rows.map((t) => (
                <div key={t.id} className={`bulk-row${selected.has(t.id) ? " is-selected" : ""}`}>
                  {t.node}
                  {/* a round tick on the icon's corner: no gutter beside every row, and it's where the eye already is */}
                  <button type="button" role="checkbox" className="bulk-tick" aria-checked={selected.has(t.id)} aria-label={`Select ${t.merchant}`}
                    onClick={(e) => toggle(t.id, e.shiftKey)}>
                    <Check size={12} strokeWidth={3} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {(ids.length > 0 || result) && (
        // on a phone, while choosing, this takes the tab bar's place: the count up top, the actions as a toolbar
        <div className="bulk-bar" role="region" aria-label="Change selected transactions" data-selecting={ids.length > 0 || undefined}>
          {ids.length > 0 ? (
            <>
              <div className="bulk-head">
                <span className="bulk-count">{ids.length} selected</span>
                {pending && <span className="bulk-msg">Saving…</span>}
                <button type="button" className="icon-btn bulk-clear" aria-label="Clear selection" onClick={() => { setSelected(new Set()); setRenaming(false); }}><X size={18} strokeWidth={2} /></button>
              </div>
              {renaming ? (
                <form className="bulk-rename" onSubmit={(e) => { e.preventDefault(); run(() => bulkUpdate(ids, { merchant: name })); }}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New name, e.g. Superstore" autoFocus aria-label="New name" />
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={() => { setRenaming(false); setName(""); }}>Cancel</button>
                  <button className="nl-btn nl-btn-sm nl-btn-primary" disabled={pending || !name.trim()}>Rename</button>
                </form>
              ) : (
                <div className="bulk-actions">
                  <Menu value="" placeholder="Move to bucket" icon={<FolderInput size={15} strokeWidth={1.75} aria-hidden />} options={bucketOptions.filter((o) => o.value !== "")}
                    onChange={(v) => run(() => bulkUpdate(ids, { bucketId: v }))} />
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary" onClick={() => setRenaming(true)}><PencilLine size={15} strokeWidth={1.75} aria-hidden />Rename</button>
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending} onClick={() => run(() => bulkUpdate(ids, { needsReview: false }))}>
                    <CircleCheck size={15} strokeWidth={1.75} aria-hidden />Checked
                  </button>
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending} onClick={() => run(() => bulkUpdate(ids, { needsReview: true }))}>
                    <Flag size={15} strokeWidth={1.75} aria-hidden />Needs a look
                  </button>
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost btn-danger" disabled={pending}
                    onClick={() => run(() => bulkDelete(ids))}>
                    <Trash2 size={15} strokeWidth={1.75} aria-hidden />Delete
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <span className={result?.error ? "bulk-msg err" : "bulk-msg"} role="status">{result?.error ?? result?.ok}</span>
              <button type="button" className="icon-btn bulk-clear" aria-label="Dismiss" onClick={() => setResult(null)}><X size={18} strokeWidth={2} /></button>
            </>
          )}
        </div>
      )}
    </>
  );
}
