"use client";

import { ChevronDown } from "lucide-react";

/**
 * Folds the card or section around it. The choice is kept in a cookie the server reads, so a folded card
 * is folded on the first paint, with no flash. `remember={false}` folds for this visit only.
 */
export function CollapseToggle({ id, label, collapsed, remember = true }: { id: string; label: string; collapsed: boolean; remember?: boolean }) {
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.closest<HTMLElement>("[data-collapsible]");
    if (!box) return;
    const now = box.dataset.collapsed !== "true";
    box.dataset.collapsed = String(now);
    e.currentTarget.setAttribute("aria-expanded", String(!now));
    if (!remember) return;
    const read = document.cookie.split("; ").find((c) => c.startsWith("nl_folded="))?.split("=")[1] ?? "";
    const set = new Set(decodeURIComponent(read).split(",").filter(Boolean));
    if (now) set.add(id); else set.delete(id);
    document.cookie = `nl_folded=${encodeURIComponent([...set].slice(-200).join(","))}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="collapse-toggle" aria-expanded={!collapsed} aria-label={`Fold ${label}`} onClick={toggle}>
      <ChevronDown size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}
