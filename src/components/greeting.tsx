"use client";

import { LOCALE } from "@/lib/format";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
const hour = () => new Date().getHours();
const today = () => new Date().toLocaleDateString(LOCALE, { weekday: "long", month: "long", day: "numeric" });

/** "Good evening, Alex" in the viewer's own time zone (the server runs on UTC), plus today's date. */
export function Greeting({ name }: { name: string }) {
  const h = useSyncExternalStore(noop, hour, () => null);
  const date = useSyncExternalStore(noop, today, () => " ");
  const hello = h === null ? "Hi" : h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <p className="caption">{date}</p>
      <h1 className="title">{hello}, {name}</h1>
    </div>
  );
}
