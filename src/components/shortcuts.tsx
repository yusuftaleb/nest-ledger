"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const KEYS: [string[], string][] = [
  [["/"], "Search"],
  [["N"], "Add a transaction"],
  [["←", "→"], "Earlier or later period"],
  [["G", "H"], "Go to Home"],
  [["G", "A"], "Go to Activity"],
  [["G", "N"], "Go to Analysis"],
  [["G", "P"], "Go to Plan"],
  [["Esc"], "Close a peek"],
  [["?"], "Show these shortcuts"],
];

/**
 * Keyboard shortcuts on a laptop. They never fire while typing in a field, with a modifier held, or (for the
 * arrows) while a peek or menu is open, so they can't take a keystroke meant for something else.
 */
export function Shortcuts() {
  const router = useRouter();
  const path = usePathname();
  const [help, setHelp] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const go = useRef<number>(0);

  useEffect(() => { if (help) dialog.current?.showModal(); }, [help]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const covered = !!document.querySelector(".peek, dialog[open], .menu-pop, .date-pop:popover-open");
      const k = e.key;
      // "g" then a letter, within a second
      if (Date.now() - go.current < 1000) {
        const to = { h: "/", a: "/transactions", n: "/analysis", p: "/plan" }[k.toLowerCase()];
        go.current = 0;
        if (to) { e.preventDefault(); router.push(to); return; }
      }
      if (k === "g") { go.current = Date.now(); return; }
      if (k === "?") { e.preventDefault(); setHelp(true); return; }
      if (k === "/") {
        const field = document.querySelector<HTMLInputElement>('main input[type="search"]');
        e.preventDefault();
        if (field) { field.focus(); field.select(); return; }
        try { sessionStorage.setItem("nl-focus-search", "1"); } catch {}
        router.push("/transactions");
        return;
      }
      if (k === "n" && !covered) { e.preventDefault(); router.push("/add", { scroll: false }); return; }
      if ((k === "ArrowLeft" || k === "ArrowRight") && !covered) {
        const arrow = document.querySelector<HTMLAnchorElement>(`main .period-step a.period-arrow[aria-label^="${k === "ArrowLeft" ? "Earlier" : "Later"}"]`);
        if (arrow) { e.preventDefault(); arrow.click(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [router, path]);

  if (!help) return null;
  return (
    <dialog ref={dialog} className="confirm shortcuts" aria-labelledby="shortcuts-title" onClose={() => setHelp(false)}
      onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="confirm-in">
        <h2 id="shortcuts-title" className="confirm-title">Keyboard shortcuts</h2>
        <dl className="shortcut-list">
          {KEYS.map(([keys, what]) => <div key={what}><dt>{keys.map((p) => <kbd key={p}>{p}</kbd>)}</dt><dd>{what}</dd></div>)}
        </dl>
        <div className="confirm-actions">
          <button type="button" className="nl-btn nl-btn-md nl-btn-secondary" autoFocus onClick={() => dialog.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}
