"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, ChartColumnBig, House, List, Plus, Settings } from "lucide-react";
import { Logo } from "./logo";
import { ThemeSwitch, type Theme } from "./theme-switch";

/**
 * Desktop navigation (≥1024px), compact: the five pages and nothing under them. Phones keep the bottom tab bar.
 * `base` prefixes links for /demo.
 */
export function SideNav({ theme, base = "" }: { theme: Theme; base?: string }) {
  const path = usePathname();
  const router = useRouter();
  const items = [
    { href: `${base}/`, label: "Home", Icon: House },
    { href: "/transactions", label: "Activity", Icon: List, real: true },
    { href: `${base}/analysis`, label: "Analysis", Icon: ChartColumnBig },
    { href: `${base}/plan`, label: "Plan", Icon: CalendarRange },
    { href: "/settings", label: "Settings", Icon: Settings, real: true },
  ];
  const home = base ? base : "/";
  // N starts a new transaction and 1–5 open the pages, from anywhere, unless you're typing or a peek is open
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const page = /^[1-5]$/.test(e.key) ? items[Number(e.key) - 1] : undefined;
      if (e.key !== "n" && !page) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open], [role=dialog]")) return;
      if (page && base && page.real) return;
      e.preventDefault();
      router.push(page ? (page.href === `${base}/` ? home : page.href) : "/add");
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const currentItem = items.find((i) => {
    const target = i.href === `${base}/` ? home : i.href;
    return target === home ? path === home : path.startsWith(target);
  });

  return (
    <nav className="sidenav" aria-label="Main">
      <Link href={home} className="sidenav-brand" aria-label="Nest Ledger, home"><Logo size={24} /></Link>
      <Link href="/add" scroll={false} className="sidenav-add" aria-keyshortcuts="n">
        <Plus size={16} strokeWidth={2} aria-hidden />New transaction<kbd aria-hidden>N</kbd>
      </Link>
      <ul>
        {items.map((item, n) => {
          const target = item.href === `${base}/` ? home : item.href;
          const current = item === currentItem;
          const off = base && item.real;
          return (
            <li key={item.label}>
              <Link href={off ? "#" : target} className="sidenav-item" aria-current={current ? "page" : undefined}
                aria-disabled={off || undefined} tabIndex={off ? -1 : undefined} aria-keyshortcuts={String(n + 1)}>
                <item.Icon size={18} strokeWidth={1.75} aria-hidden />{item.label}<kbd aria-hidden>{n + 1}</kbd>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="sidenav-foot"><ThemeSwitch initial={theme} compact /></div>
    </nav>
  );
}

