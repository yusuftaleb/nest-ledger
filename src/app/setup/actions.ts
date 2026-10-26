"use server";

import { redirect } from "next/navigation";
import { adminClient, missingSetupSettings, needsSetup } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSetupPassword, signInAndJoin } from "@/lib/setup";

/** After a failed try, what was typed comes back so the form keeps it (passwords are never sent back). */
export type SetupState = { error?: string; name?: string; household?: string; email?: string } | null;

/** Claims a brand-new copy: checks the setup password, creates the owner's account and the household. */
export async function setUp(_prev: SetupState, form: FormData): Promise<SetupState> {
  const typed = { name: String(form.get("name") ?? ""), household: String(form.get("household") ?? ""), email: String(form.get("email") ?? "") };
  const fail = (error: string): SetupState => ({ error, ...typed });
  const missing = missingSetupSettings();
  if (missing.length) return { error: `The server is missing ${missing.join(", ")}. Add them in Vercel → Settings → Environment Variables, then redeploy.` };
  if (!isSetupPassword(String(form.get("setup_password") ?? ""))) return fail("That isn’t the setup password.");
  if (!(await needsSetup())) return fail("This Nest Ledger is already set up. Sign in instead.");

  const name = String(form.get("name") ?? "").trim();
  const household = String(form.get("household") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter your email address.");
  if (password.length < 8) return fail("Use at least 8 characters for your password.");

  // an account from an earlier try that stopped half way is fine: signing in below checks its password
  const { error: createError } = await adminClient()!.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError && createError.code !== "email_exists") return fail(createError.message);

  const joined = await signInAndJoin(email, password, name);
  if (joined.error) return fail(joined.error);
  if (household) await (await createClient()).from("households").update({ name: household }).eq("id", joined.householdId!);
  redirect("/");
}
