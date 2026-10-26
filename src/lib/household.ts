import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { CURRENCY } from "./format";
import type { Account, Bucket, Member, Rule } from "./types";
import { withFamilyColors } from "./buckets";

/**
 * The client and the signed-in user, for server actions that need nothing else; signed out goes to /login.
 * Row-level security limits every read and write to the user's household.
 */
export async function getSession() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

/**
 * Someone signed in who isn't in the household and wasn't invited by its owner: sign them out and say so.
 * bootstrap_member refuses them with "not invited" (only the very first person sets a household up).
 */
async function turnAway(supabase: Awaited<ReturnType<typeof createClient>>): Promise<never> {
  await supabase.auth.signOut();
  redirect("/login?error=private");
}

/** The session plus the household's id, for inserts that name it. Same lookup (and first-sign-in join) as getHousehold. */
export async function getHouseholdId() {
  const session = await getSession();
  const { data: householdId, error } = await session.supabase.rpc("bootstrap_member", { home_currency: CURRENCY });
  if (error?.message === "not invited") await turnAway(session.supabase);
  if (error) throw new Error(`Could not load your household: ${error.message}`);
  return { ...session, householdId: householdId as string };
}

/**
 * Everything most screens need, loaded once per request. The first call after sign-in joins an invited
 * user to the household; only the very first person to sign in creates one (with default accounts and buckets).
 */
export const getHousehold = cache(async () => {
  const { supabase, userId } = await getSession();

  // Row-level security already limits these reads to the user's household, so they run
  // alongside bootstrap_member. Only on the very first sign-in (not a member yet) do we read again.
  const load = () => Promise.all([
    supabase.from("members").select("user_id, household_id, display_name, email, avatar, role"),
    supabase.from("accounts").select("id, name, institution, kind, currency, owner_id, is_debt, archived, sort, attrs").order("sort"),
    supabase.from("buckets").select("id, name, parent_id, kind, icon, color, sort, archived, target_cents, target_date, attrs").order("sort").order("name"),
    supabase.from("rules").select("pattern, bucket_id"),
    supabase.from("transactions").select("date").order("date").limit(1),
  ]);
  const [{ data: householdId, error }, first] = await Promise.all([supabase.rpc("bootstrap_member", { home_currency: CURRENCY }), load()]);
  if (error?.message === "not invited") await turnAway(supabase);
  if (error) throw new Error(`Could not load your household: ${error.message}`);
  const isMember = first[0].data?.some((m) => m.user_id === userId);
  const [members, accounts, buckets, rules, earliest] = isMember ? first : await load();

  const memberList = ((members.data ?? []) as Member[]).filter((m) => m.household_id === householdId);
  const bucketList = withFamilyColors((buckets.data ?? []) as Bucket[]);
  return {
    supabase,
    userId,
    householdId: householdId as string,
    me: memberList.find((m) => m.user_id === userId)!,
    members: memberList,
    accounts: (accounts.data ?? []) as Account[],
    /** All buckets, archived too, so old transactions still show their category. */
    buckets: bucketList,
    rules: (rules.data ?? []) as Rule[],
    /** The first transaction's date, so period pickers and date filters start where the history does. */
    earliest: (earliest.data?.[0]?.date as string | undefined) ?? null,
  };
});

export type Household = Awaited<ReturnType<typeof getHousehold>>;
