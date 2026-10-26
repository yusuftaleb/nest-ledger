"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Tells the server this device's time zone (a cookie), once, and refreshes if it was assuming another one. */
export function TimeZoneSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === current) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
