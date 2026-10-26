"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type Done = { ok?: string; error?: string } | null | void;
type Note = { id: number; text: string; undo?: () => Promise<Done> };

const listeners = new Set<(n: Note) => void>();
let next = 0;

/**
 * Say what just happened, with an Undo button, instead of asking "are you sure?" first. The change is already
 * made; Undo puts it back. Call from any client component; the bar lives once in the app shell.
 */
export function showUndo(text: string, undo?: () => Promise<Done>) {
  const note = { id: ++next, text, undo };
  for (const l of listeners) l(note);
}

/** The bar at the bottom of the screen. Stays 7 seconds, longer while the pointer or focus is on it. */
export function UndoBar() {
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const show = (n: Note) => { setBusy(false); setNote(n); };
    listeners.add(show);
    return () => { listeners.delete(show); };
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (note && !held && !busy) timer.current = setTimeout(() => setNote(null), note.undo ? 7000 : 3500);
    return () => clearTimeout(timer.current);
  }, [note, held, busy]);

  if (!note) return <div className="undo-live" role="status" aria-live="polite" />;
  const undo = async () => {
    if (!note.undo) return;
    setBusy(true);
    const r = await note.undo();
    setBusy(false);
    setNote({ id: ++next, text: r && r.error ? r.error : "Undone." });
    router.refresh();
  };
  return (
    <div className="undo-live" role="status" aria-live="polite">
      <div key={note.id} className="undo-bar" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
        <span className="undo-text">{note.text}</span>
        {note.undo && <button type="button" className="undo-btn" onClick={undo} disabled={busy}>{busy ? "Undoing…" : "Undo"}</button>}
        <button type="button" className="icon-btn undo-close" aria-label="Dismiss" onClick={() => setNote(null)}><X size={16} strokeWidth={2} /></button>
      </div>
    </div>
  );
}
