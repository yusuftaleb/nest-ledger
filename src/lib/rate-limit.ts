import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminClient } from "./supabase/admin";

// How many tries are allowed, and over how long. Supabase limits sign-ins per address too, but every try reaches
// it from this server's address, so the limits that tell one visitor from another live here.
export const LIMITS = {
  signIn: { max: 10, seconds: 15 * 60 },
  sendCode: { max: 5, seconds: 15 * 60 },
  checkCode: { max: 10, seconds: 15 * 60 },
  setup: { max: 10, seconds: 60 * 60 },
} as const;

/** The visitor's address as the host saw it (Vercel puts it first in x-forwarded-for). */
async function visitor(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Without the service role key the tries are counted in this server's memory: weaker (each server instance
// counts on its own, and a restart forgets), but never nothing.
const memory = new Map<string, number[]>();
function allowInMemory(key: string, max: number, seconds: number): boolean {
  const now = Date.now(), recent = (memory.get(key) ?? []).filter((t) => t > now - seconds * 1000);
  if (recent.length >= max) { memory.set(key, recent); return false; }
  memory.set(key, [...recent, now]);
  if (memory.size > 10_000) memory.delete(memory.keys().next().value!);
  return true;
}

/**
 * Counts one try at `kind` for this visitor (and `about`, such as the email) and says whether it may go ahead.
 * Only a hash of the two is stored.
 */
export async function allowAttempt(kind: keyof typeof LIMITS, about = ""): Promise<boolean> {
  const { max, seconds } = LIMITS[kind];
  const key = createHash("sha256").update(`${kind}\n${about.toLowerCase()}\n${await visitor()}`).digest("hex");
  const admin = adminClient();
  if (!admin) return allowInMemory(key, max, seconds);
  const { data, error } = await admin.rpc("allow_attempt", { attempt_key: key, max_attempts: max, per_seconds: seconds });
  return error ? allowInMemory(key, max, seconds) : data === true;
}

export const TOO_MANY = "Too many tries. Wait a few minutes, then try again.";
