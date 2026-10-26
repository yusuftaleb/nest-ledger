"use client";

import { useRef, useState } from "react";

type Item = { id: string; label: string; color: string; kind?: "bar" | "line" };

/**
 * A chart's legend that also chooses what it shows: tap a series to hide or show it, hold it (or Alt-click) to
 * see only that one, and hold it again to bring the rest back. It marks the chart's figure (`data-hide`), and
 * the chart's own CSS fades out each hidden series, so the chart itself can stay on the server.
 */
export function SeriesLegend({ items }: { items: Item[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef(false);
  const apply = (next: Set<string>) => {
    setHidden(next);
    ref.current?.closest("figure")?.setAttribute("data-hide", [...next].join(" "));
  };
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    // never hide everything: hiding the last one shows them all again
    apply(next.size === items.length ? new Set() : next);
  };
  const solo = (id: string) => {
    const only = hidden.size === items.length - 1 && !hidden.has(id);
    apply(only ? new Set() : new Set(items.map((i) => i.id).filter((x) => x !== id)));
  };
  return (
    <ul className="legend legend-toggle" ref={ref} aria-label="Show or hide lines">
      {items.filter((i) => i.label).map((i) => (
        <li key={i.id}>
          <button type="button" aria-pressed={!hidden.has(i.id)} title="Tap to hide or show, hold to see only this"
            onPointerDown={() => { held.current = false; timer.current = setTimeout(() => { held.current = true; solo(i.id); }, 450); }}
            onPointerUp={() => clearTimeout(timer.current)} onPointerLeave={() => clearTimeout(timer.current)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => { if (held.current) { held.current = false; return; } if (e.altKey) solo(i.id); else toggle(i.id); }}>
            <span className={`legend-key ${i.kind ?? "bar"}`} style={{ background: i.color }} aria-hidden />{i.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
