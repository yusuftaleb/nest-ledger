"use client";

import { useRef, useState } from "react";

/**
 * One tooltip for a whole chart. Any descendant with `data-tip` shows it on hover or keyboard focus,
 * so the server-drawn chart stays plain HTML/SVG. Tips only repeat values that are also in the
 * chart's table view; they never hold the only copy.
 */
export function ChartTip({ children, className, beside = false }: { children: React.ReactNode; className?: string; beside?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number; at: "above" | "below" | "right" | "left" } | null>(null);

  function show(target: EventTarget | null) {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
    const box = ref.current;
    if (!el || !box || !box.contains(el)) return setTip(null);
    // a mark can name the part of itself the tip points at (the top of a column, say), so a tall hit area doesn't
    // push the tip off to its far end
    const r = (el.querySelector<HTMLElement>("[data-tip-at]") ?? el).getBoundingClientRect(), b = box.getBoundingClientRect();
    if (beside) {
      // next to the mark at that height, on the outer side, so it covers neither the chart's title nor the
      // neighbouring marks; it swaps sides when there is no room for it there
      const m = el.getBoundingClientRect(), right = m.right - b.left + 8;
      const outer = m.left + m.width / 2 - b.left < b.width / 2;
      const left = outer ? m.left - b.left >= 208 : right + 200 > b.width;
      return setTip({ text: el.dataset.tip ?? "", x: left ? m.left - b.left - 8 : right, y: Math.max(r.top + r.height / 2 - b.top, 30), at: left ? "left" : "right" });
    }
    const x = Math.min(Math.max(r.left + r.width / 2 - b.left, 72), b.width - 72);
    const top = r.top - b.top;
    const below = top < 48;
    setTip({ text: el.dataset.tip ?? "", x, y: below ? r.bottom - b.top + 8 : top - 8, at: below ? "below" : "above" });
  }

  return (
    <div ref={ref} className={`chart ${className ?? ""}`}
      onPointerOver={(e) => show(e.target)} onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)} onBlur={() => setTip(null)}>
      {children}
      {tip && (
        <div className={`chart-tip${tip.at === "above" ? "" : ` ${tip.at}`}`} style={{ left: tip.x, top: tip.y }} role="status">
          {tip.text.split("\n").map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  );
}
