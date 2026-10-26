"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { inviteFor, signInAndJoin } from "@/lib/setup";

export type JoinState = { error?: string; name?: string } | null;

/** Creates the invited person's account with the password they chose, then joins them (which uses up the link). */
export async function join(token: string, _prev: JoinState, form: FormData): Promise<JoinState> {
  const invite = await inviteFor(token);
  if (!invite) return { error: "This join link has run out or was replaced. Ask for a new one." };
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", name };

  const { error } = await adminClient()!.auth.admin.createUser({ email: invite.email, password, email_confirm: true });
  if (error && error.code !== "email_exists") return { error: error.message, name };

  const joined = await signInAndJoin(invite.email, password, name);
  if (joined.error) return { error: joined.error, name };
  redirect("/");
}
