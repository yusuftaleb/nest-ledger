import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { CURRENCY } from "./format";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/** The setup password from the server's settings, compared in constant time. */
export function isSetupPassword(given: string): boolean {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Signs the new account in (its session cookie is set on this response), then joins it to the household:
 * the very first person creates it, an invited person joins the one that invited them. Names them too.
 */
export async function signInAndJoin(email: string, password: string, name: string): Promise<{ error?: string; householdId?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "That email already has an account with a different password. Sign in instead." };
  const { data: householdId, error: joinError } = await supabase.rpc("bootstrap_member", { home_currency: CURRENCY });
  if (joinError) {
    await supabase.auth.signOut();
    return { error: joinError.message === "not invited" ? "This Nest Ledger is private. Ask its owner for a new join link." : joinError.message };
  }
  if (name) await supabase.from("members").update({ display_name: name }).eq("user_id", data.user.id);
  return { householdId: householdId as string };
}

/** The invite behind a join link, if it is still good. Read with the service role: tokens are never shown to members. */
export async function inviteFor(token: string) {
  const admin = adminClient();
  if (!admin || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await admin.from("invites").select("email, expires_at, households(name)").eq("token", token).maybeSingle();
  if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) return null;
  const household = data.households as unknown as { name: string } | null;
  return { email: data.email as string, household: household?.name ?? "the household" };
}
