"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "password" | "email" | "code"; email?: string; error?: string };

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error?.status === 429) return { step: "password", email, error: "Too many tries. Wait a minute, then try again." };
  if (error) return { step: "password", email, error: "That email and password don’t match." };
  redirect("/");
}

export async function sendCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { step: "email", error: "Enter your email address." };

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  // Only people already in the household get a code; this never creates an account.
  // Everyone sees the same answer, so the form doesn't reveal who is a member.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm`, shouldCreateUser: false },
  });
  if (error?.status === 429) return { step: "email", email, error: "Too many tries. Wait a minute, then send a new code." };
  return { step: "code", email };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code didn't work. Check it, or send a new one." };
  redirect("/");
}
