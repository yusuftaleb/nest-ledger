import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./keys";

// The service role key skips row-level security, so it never leaves the server and is used for exactly two
// things: creating the first person's account on /setup, and creating an invited person's account from their
// join link. Both run only after their own checks (the setup password; a join token that hasn't run out).

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

/** Settings /setup needs that are missing on the server, by name (never their values). */
export function missingSetupSettings(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SETUP_PASSWORD) missing.push("SETUP_PASSWORD");
  return missing;
}

/** A client with no session that acts as the project's admin, or null when the key isn't set. */
export function adminClient() {
  const key = serviceKey();
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** True until the first person has set the household up. False when it can't tell (no service role key). */
export async function needsSetup(): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { count, error } = await admin.from("households").select("id", { count: "exact", head: true });
  return !error && count === 0;
}
