// Has Codex read the household's numbers and write AI Insights, using the household's own ChatGPT account
// through the Codex CLI on this computer (no API key, no bill). On a Mac, launchd can run it daily (scripts/ai-insights.plist):
//
//   npm run insights:ai               write a fresh run for every household
//   npm run insights:ai -- --dry-run  print what Codex wrote, save nothing
//   npm run insights:ai -- --facts    print the facts that would be sent, run nothing
//
// What is sent to OpenAI: bucket names and bucket-level sums (no merchants, accounts or people). Codex runs in an
// empty folder, read-only, with nothing saved. The Supabase secret key is fetched at run time with the Supabase
// CLI's keychain login and never written to disk.

import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFacts, OUTPUT_SCHEMA, promptFor, readReply } from "../src/lib/ai-insights.ts";
import { applyRecurringExclusions, type RecurringExclusion } from "../src/lib/recurring-exclusions.ts";
import { applyMonthRules, type MonthRule } from "../src/lib/month-rules.ts";

const dryRun = process.argv.includes("--dry-run");
const factsOnly = process.argv.includes("--facts");
const root = new URL("..", import.meta.url).pathname;

const env = Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split("\n")
  .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter((m) => m !== null).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local");
const ref = new URL(url).hostname.split(".")[0];

/** The project's secret key, through the Supabase CLI's saved login (keychain), held in memory only. */
async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  let token = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"]).toString().trim();
  if (token.startsWith("go-keyring-base64:")) token = Buffer.from(token.slice(18), "base64").toString().trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Supabase would not hand over the key (${res.status}). Run: npx supabase login`);
  const keys = (await res.json()) as { type?: string; name?: string; api_key?: string }[];
  const key = keys.find((k) => k.type === "secret")?.api_key ?? keys.find((k) => k.name === "service_role")?.api_key;
  if (!key) throw new Error("No secret key on the project");
  return key;
}

function codexBin(): string {
  for (const p of ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]) if (existsSync(p)) return p;
  return "codex";
}

/** Asks Codex (gpt-6.1-sol at low effort: the facts are already worked out, so it only has to write) and returns its JSON reply. */
function askCodex(prompt: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), "nest-ai-"));
  try {
    writeFileSync(join(dir, "schema.json"), JSON.stringify(OUTPUT_SCHEMA));
    const out = join(dir, "reply.json");
    const run = spawnSync(codexBin(), ["exec", "--ephemeral", "--skip-git-repo-check", "--color", "never", "-s", "read-only", "-C", dir,
      "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="low"',
      "--output-schema", join(dir, "schema.json"), "-o", out, "-"], { input: prompt, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 });
    if (run.error) throw run.error;
    if (run.status !== 0 || !existsSync(out)) throw new Error(`Codex stopped (exit ${run.status}): ${(run.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
    const text = readFileSync(out, "utf8");
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const db = createClient(url, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const today = new Date();
const { data: households, error } = await db.from("households").select("id");
if (error) throw new Error(`Could not read households: ${error.message}`);

for (const { id } of households ?? []) {
  const lines: Parameters<typeof buildFacts>[0] = [];
  const since = new Date(today.getFullYear() - 2, today.getMonth() - 1, 1).toISOString().slice(0, 10);
  for (let from = 0; from < 400_000; from += 20_000) {
    const { data, error } = await db.from("lines").select("date, month, merchant, amount_cents, bucket, top_bucket, kind, transaction_id, account_id")
      .eq("household_id", id).gte("date", since).order("date").order("split_id").range(from, from + 19_999);
    if (error) throw new Error(`Could not load lines: ${error.message}`);
    lines.push(...(data as typeof lines));
    if (data.length < 20_000) break;
  }
  const { data: excl } = await db.from("recurring").select("merchant, account_id")
    .eq("household_id", id).eq("active", false).eq("attrs->>exclude_from_detection", "true");
  // rent sent early and income paid ahead count in the month they're for
  const { data: rules } = await db.from("recurring").select("merchant, account_id, attrs")
    .eq("household_id", id).eq("active", true).eq("attrs->>counts_for", "next_month");
  const timed = applyMonthRules(lines, (rules ?? []) as MonthRule[]);
  const facts = buildFacts(applyRecurringExclusions(timed.lines, (excl ?? []) as RecurringExclusion[]), today);
  if (facts.length === 0) { console.log(`${id.slice(0, 8)}: not enough history yet`); continue; }
  if (factsOnly) { console.log([...timed.notes, ...facts.map((f) => `${f.id}: ${f.value} (${f.about})`)].join("\n")); continue; }

  const { data: last } = await db.from("ai_insights").select("items").eq("household_id", id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  const previous = ((last?.items ?? []) as { text?: string; title?: string }[]).map((i) => i.text ?? i.title ?? "").filter(Boolean);
  const started = Date.now();
  let reply = askCodex(promptFor(facts, previous, timed.notes));
  let read = readReply(reply, facts);
  // the summary leads the card, so one that broke the number rule is worth a second try
  if (!read.summary) {
    const again = askCodex(promptFor(facts, previous, timed.notes));
    const second = readReply(again, facts);
    if (second.summary && second.insights.length >= Math.min(4, read.insights.length)) { reply = again; read = second; }
  }
  const { summary, insights, patterns } = read;
  console.log(`${id.slice(0, 8)}: ${summary ? "a summary, " : "no summary, "}${insights.length} insights, ${patterns.length} patterns in ${Math.round((Date.now() - started) / 1000)}s`);
  if (dryRun) { console.log(JSON.stringify({ asked: reply, kept: { summary, insights, patterns } }, null, 2)); continue; }
  if (insights.length + patterns.length === 0) { console.log("  nothing usable came back; keeping the last run"); continue; }

  const items = [...(summary ? [{ kind: "summary", text: summary }] : []), ...insights.map((i) => ({ kind: "insight", ...i })), ...patterns.map((p) => ({ kind: "pattern", ...p }))];
  const { error: insertError } = await db.from("ai_insights").insert({ household_id: id, items, model: "codex" });
  if (insertError) throw new Error(`Could not save: ${insertError.message}`);
  // keep the last 30 runs
  const { data: old } = await db.from("ai_insights").select("id").eq("household_id", id).order("generated_at", { ascending: false }).range(30, 1000);
  if (old?.length) await db.from("ai_insights").delete().in("id", old.map((o) => o.id));
}
