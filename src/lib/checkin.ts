import type { getHousehold } from "./household";

export type CheckIn = { at: string; by: string | null } | null;

/** The last weekly check-in (settings key "checkin"), or null before the first. */
export async function lastCheckIn(h: Awaited<ReturnType<typeof getHousehold>>): Promise<CheckIn> {
  const { data } = await h.supabase.from("settings").select("value").eq("household_id", h.householdId).eq("key", "checkin").maybeSingle();
  const v = data?.value as { at?: string; by?: string } | null;
  return v?.at ? { at: v.at, by: v.by ?? null } : null;
}

/** A check-in is due when there hasn't been one in the last six days. */
export const checkInDue = (last: CheckIn, now: Date) => !last || now.getTime() - new Date(last.at).getTime() > 6 * 86_400_000;
