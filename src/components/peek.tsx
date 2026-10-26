"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Maximize2, X } from "lucide-react";

const PeekContext = createContext<{ close: () => void } | null>(null);
/** The open peek, if this component is inside one: saving or deleting closes it rather than leaving the page. */
export const usePeek = () => useContext(PeekContext);

/**
 * A centred peek over the page you were on, like Notion's center peek. It lives at the item's own URL, so
 * Back, Escape, the backdrop and the close button all return to the page behind it exactly as it was;
 * a refresh or a shared link opens the full page instead.
 */
export function Peek(props: { href: string; label: string; children: React.ReactNode }) {
  // a slot keeps what it last showed when you navigate somewhere it doesn't match, so the peek only
  // shows while the address is still a transaction's (or Add's, or a budget's)
  return /^\/(transactions\/[^/]+|add|budgets\/new)$/.test(usePathname()) ? <Open {...props} /> : null;
}

function Open({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // a field inside that asks for focus (Add's name box) gets it; otherwise the dialog takes it
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current;
    first?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".menu-pop, .date-pop")) close(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; before?.focus({ preventScroll: true }); };
  }, [close]);

  return (
    <PeekContext.Provider value={{ close }}>
      <div className="peek-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="peek" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
          <div className="peek-bar">
            {/* a plain link, so it loads the full page rather than being caught by the peek again */}
            <a href={href} className="icon-btn peek-btn" aria-label="Open as a full page" title="Open as a full page"><Maximize2 size={16} strokeWidth={1.75} /></a>
            <button type="button" className="icon-btn peek-btn" onClick={close} aria-label="Close" title="Close (Esc)"><X size={18} strokeWidth={1.75} /></button>
          </div>
          <div className="peek-body">{children}</div>
        </div>
      </div>
    </PeekContext.Provider>
  );
}
