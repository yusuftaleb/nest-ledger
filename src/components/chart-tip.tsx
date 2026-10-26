"use client";

import { useRef, useState } from "react";

/**
 * One tooltip for a whole chart. Any descendant with `data-tip` shows it on hover or keyboard focus,
 * so the server-drawn chart stays plain HTML/SVG. Tips only repeat values that are also in the
 * chart's table view; they never hold the only copy.
 */
export function ChartTip({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);

  function show(target: EventTarget | null) {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
    const box = ref.current;
    if (!el || !box || !box.contains(el)) return setTip(null);
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - b.left, 72), b.width - 72);
    const top = r.top - b.top;
    setTip({ text: el.dataset.tip ?? "", x, y: top < 48 ? r.bottom - b.top + 8 : top - 8, below: top < 48 });
  }

  return (
    <div ref={ref} className={`chart ${className ?? ""}`}
      onPointerOver={(e) => show(e.target)} onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)} onBlur={() => setTip(null)}>
      {children}
      {tip && (
        <div className={`chart-tip${tip.below ? " below" : ""}`} style={{ left: tip.x, top: tip.y }} role="status">
          {tip.text.split("\n").map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  );
}
