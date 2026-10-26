"use client";

import { usePathname } from "next/navigation";

/** What a season link asks the explorer to show. */
export type ExploreRequest = { q: string; view: "years" };
export const EXPLORE_EVENT = "nl-explore";

/**
 * A month in "Months that cost more": a tap fills the explorer at the top of the page with that month in every
 * year and scrolls up to it, without a page load. A new tab, or a page without the explorer, follows the link.
 */
export function SeasonLink({ q, label, title, className, children }: { q: string; label: string; title: string; className?: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <a role="listitem" href={`${path}?${new URLSearchParams({ q, view: "years" })}`} className={className} aria-label={label} title={title}
      onClick={(e) => {
        const explorer = document.getElementById("explore");
        if (!explorer || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent<ExploreRequest>(EXPLORE_EVENT, { detail: { q, view: "years" } }));
        explorer.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }}>
      {children}
    </a>
  );
}
