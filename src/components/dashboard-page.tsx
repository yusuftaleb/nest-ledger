import { Suspense } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { ThemeFlip } from "./theme-switch";
import { Greeting } from "./greeting";
import { PeriodSwitch } from "./period-switch";
import { BoardSkeleton } from "./skeleton";
import { WidgetBoard } from "./widgets";
import { periodAt, type PeriodKey } from "@/lib/dashboard";
import { isoDate } from "@/lib/dates";
import type { DashboardSource } from "@/lib/dashboard-source";

/** Home and Plan: a heading, the period switch (with back and forward), and the page's widget rows. */
export function DashboardPage({ source, page, period, at, path, today, nudge }: {
  source: DashboardSource; page: "home" | "plan"; period: PeriodKey; at?: string; path: string; today: Date;
  /** Something to offer beside the period switch (Home: the weekly check-in, when it's due). It streams in. */
  nudge?: React.ReactNode;
}) {
  const { range, anchor, live } = periodAt(period, at, today);
  return (
    <>
      <header className="page-head">
        {page === "home"
          ? <div className="head-row"><Greeting name={source.me.display_name} />
              <span className="head-actions hide-desktop">
                <ThemeFlip />
                <Link href="/settings" className="icon-btn" aria-label="Settings"><Settings size={20} strokeWidth={1.75} /></Link>
              </span></div>
          : <h1 className="title">Plan</h1>}
        <div className="page-tools">
          {nudge && <Suspense fallback={null}>{nudge}</Suspense>}
          <PeriodSwitch path={path} period={period} range={range} live={live} today={isoDate(today)} earliest={source.earliest} />
        </div>
      </header>
      {/* The header shows at once; the cards stream in. A new period gets a fresh skeleton instead of stale numbers. */}
      <Suspense key={`${period}:${range.start}`} fallback={<BoardSkeleton summary={page === "home"} />}>
        <WidgetBoard source={source} page={page} period={period} today={anchor} live={live} />
      </Suspense>
    </>
  );
}
