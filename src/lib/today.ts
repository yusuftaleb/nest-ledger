import { cookies } from "next/headers";

/** The household is in BC; until a device has told us its own zone, days and months follow Pacific time. */
const FALLBACK_TZ = "America/Vancouver";

/**
 * Today's date on the viewer's device, as a local Date at noon. The server runs on UTC, so without this an
 * evening in BC would already be "tomorrow" and month boundaries would be off by hours. The zone comes from
 * the `tz` cookie that <TimeZoneSync> sets from the browser.
 */
export async function getToday(): Promise<Date> {
  return todayIn(await getZone());
}

/** The viewer's time zone, from the same cookie, for showing a moment (say 7:02 a.m.) as their clock reads it. */
export async function getZone(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  return tz && isZone(tz) ? tz : FALLBACK_TZ;
}

function todayIn(tz: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"), 12);
}

function isZone(tz: string) {
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return true; } catch { return false; }
}
