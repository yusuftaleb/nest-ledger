"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Menu, type Option } from "./menu";
import { PERIODS, periodRange, stepPeriod, type PeriodKey, type Range } from "@/lib/dashboard";

/**
 * Month / Quarter / Year, then back, a dropdown of every period since the first transaction, and forward.
 * The choice lives in the URL (?p=quarter&at=2026-07-01) so it survives reloads and can be shared.
 * A tapped control answers at once, before the server does.
 */
export function PeriodSwitch({ path, period, range, live, today, earliest }: {
  path: string; period: PeriodKey; range: Range; live: boolean; today: string; earliest: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [picked, setPicked] = useState<{ from: string; to: PeriodKey } | null>(null);
  const current = picked && picked.from === `${period}:${range.start}` ? picked.to : period;
  const href = (key: PeriodKey, at?: string) => {
    const q = new URLSearchParams();
    if (key !== "month") q.set("p", key);
    if (at) q.set("at", at);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const keepAt = live ? undefined : range.start ?? undefined;
  const prev = stepPeriod(range, -1), next = stepPeriod(range, 1);
  const first = earliest && earliest < today ? earliest : today;
  // every period from the first transaction to now, newest first
  const options = useMemo(() => {
    const out: Option[] = [];
    const now = periodRange(period, new Date(`${today}T12:00`));
    for (let r = now; r.start && r.end > first; r = periodRange(period, new Date(`${stepPeriod(r, -1)}T12:00`))) {
      out.push({ value: r.start, label: r.start === now.start ? `${r.label} (now)` : r.label, group: period === "year" ? undefined : r.start.slice(0, 4) });
      if (out.length > 600) break;
    }
    return out;
  }, [period, today, first]);
  const go = (to: string) => start(() => router.replace(href(period, to === options[0]?.value ? undefined : to), { scroll: false }));
  const atStart = !!range.start && range.start <= first;

  return (
    <div className="period">
      <nav className="nl-seg" aria-label="Period length">
        {PERIODS.map((p) => (
          <Link key={p.key} href={href(p.key, keepAt)} aria-current={current === p.key ? "page" : undefined}
            replace scroll={false} onClick={() => setPicked({ from: `${period}:${range.start}`, to: p.key })}>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="period-step" role="group" aria-label="Choose a period">
        {atStart
          ? <span className="period-arrow" aria-disabled="true"><ChevronLeft size={18} strokeWidth={2} aria-hidden /></span>
          : <Link href={href(period, prev)} className="period-arrow" aria-label={`Earlier ${period}`} replace scroll={false}><ChevronLeft size={18} strokeWidth={2} aria-hidden /></Link>}
        <Menu compact value={range.start ?? ""} options={options} onChange={go} align="end" />
        {live
          ? <span className="period-arrow" aria-disabled="true"><ChevronRight size={18} strokeWidth={2} aria-hidden /></span>
          : <Link href={href(period, next)} className="period-arrow" aria-label={`Later ${period}`} replace scroll={false}><ChevronRight size={18} strokeWidth={2} aria-hidden /></Link>}
        {!live && <Link href={href(period)} className="period-today" replace scroll={false}>Today</Link>}
      </div>
    </div>
  );
}
