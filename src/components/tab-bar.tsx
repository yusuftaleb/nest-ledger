"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, ChartColumnBig, House, List, Plus } from "lucide-react";
import { iconProps } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: House, local: true },
  { href: "/transactions", label: "Activity", Icon: List },
  { href: "/add", label: "Add", Icon: Plus },
  { href: "/analysis", label: "Analysis", Icon: ChartColumnBig, local: true },
  { href: "/plan", label: "Plan", Icon: CalendarRange, local: true },
];

/** `base` prefixes Home and Plan for the /demo preview. */
export function TabBar({ base = "" }: { base?: string }) {
  const path = usePathname();
  return (
    <nav className="app-tabbar" aria-label="Main">
      <div className="nl-tabbar">
        {TABS.map(({ href: plain, label, Icon, local }) => {
          const href = local && base ? (plain === "/" ? base : `${base}${plain}`) : plain;
          const home = base || "/";
          const current = href === home ? path === home : path.startsWith(href);
          if (href === "/add") {
            return (
              <Link key={href} href={href} className="nl-tab-add" scroll={false} aria-label="Add a transaction">
                <Icon {...iconProps} size={22} strokeWidth={2} />
              </Link>
            );
          }
          return (
            <Link key={href} href={href} className="nl-tab" aria-current={current ? "page" : undefined}>
              <Icon {...iconProps} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
