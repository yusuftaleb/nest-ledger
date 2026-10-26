"use server";

import { CURRENCY } from "./format";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getHousehold, getHouseholdId, getSession } from "./household";
import { isoDate } from "./dates";
import { formatCents, parseAmount } from "./money";
import { getToday } from "./today";
import { seedColor } from "./buckets";
import { guessIcon } from "./bucket-icons";

export type FormState = { ok?: string; error?: string; link?: string } | null;

const KEEP_SPLITS = "keep";
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function readTransaction(form: FormData) {
  const merchant = text(form, "merchant");
  const cents = parseAmount(text(form, "amount"));
  const date = text(form, "date");
  const accountId = text(form, "account_id");
  if (!merchant) return { error: "Add a merchant or description." };
  if (cents === null) return { error: "Enter an amount, like 14.50." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (!accountId) return { error: "Pick an account." };
  return {
    values: {
      merchant,
      amount_cents: text(form, "direction") === "in" ? cents : -cents,
      date,
      account_id: accountId,
      note: text(form, "note") || null,
    },
    bucketId: text(form, "bucket_id") || null,
  };
}

/** Learn "this merchant goes to this bucket" so imports and quick add get it right next time. */
async function learnRule(merchant: string, bucketId: string, h?: Awaited<ReturnType<typeof getHouseholdId>>) {
  const { supabase, householdId } = h ?? await getHouseholdId();
  const pattern = merchant.toLowerCase().replace(/\s+/g, " ").trim();
  if (pattern.length < 3) return;
  await supabase
    .from("rules")
    .upsert({ household_id: householdId, pattern, bucket_id: bucketId }, { onConflict: "household_id,pattern" });
}

export async function addTransaction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = readTransaction(form);
  if ("error" in parsed) return { error: parsed.error };
  const h = await getHouseholdId();
  const { supabase, householdId } = h;
  const source = text(form, "source") === "quick" ? "quick" : "manual";

  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...parsed.values, household_id: householdId, source })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: splitError } = await supabase
    .from("splits")
    .insert({ transaction_id: data.id, bucket_id: parsed.bucketId, amount_cents: parsed.values.amount_cents });
  if (splitError) return { error: splitError.message };

  if (parsed.bucketId && form.get("learn") === "on") await learnRule(parsed.values.merchant, parsed.bucketId, h);

  revalidatePath("/", "layout");
  return { ok: `Saved ${parsed.values.merchant}` };
}

export async function updateTransaction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = readTransaction(form);
  if ("error" in parsed) return { error: parsed.error };
  const { supabase } = await getSession();

  // Saving from the edit screen means a person has looked at it.
  const { error } = await supabase.from("transactions").update({ ...parsed.values, needs_review: false }).eq("id", id);
  if (error) return { error: error.message };

  // A split transaction (a receipt across several buckets) keeps its splits unless a single bucket was picked.
  if (parsed.bucketId === KEEP_SPLITS) {
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  }
  await supabase.from("splits").delete().eq("transaction_id", id);
  const { error: splitError } = await supabase
    .from("splits")
    .insert({ transaction_id: id, bucket_id: parsed.bucketId, amount_cents: parsed.values.amount_cents });
  if (splitError) return { error: splitError.message };

  if (parsed.bucketId && form.get("learn") === "on") await learnRule(parsed.values.merchant, parsed.bucketId);

  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

/** Everything a delete takes away, so Undo can put the transactions back exactly as they were. */
export type Removed = {
  transactions: Record<string, unknown>[]; splits: Record<string, unknown>[]; tags: Record<string, unknown>[];
  /** IOUs that pointed at these transactions (the database unhooks them on delete). */
  owed: { id: string; transaction_id: string | null; settled_transaction_id: string | null }[];
};

async function takeSnapshot(supabase: Awaited<ReturnType<typeof getSession>>["supabase"], ids: string[]): Promise<Removed> {
  const list = ids.join(",");
  const [t, sp, tg, ow] = await Promise.all([
    supabase.from("transactions").select("*").in("id", ids),
    supabase.from("splits").select("*").in("transaction_id", ids),
    supabase.from("transaction_tags").select("*").in("transaction_id", ids),
    supabase.from("owed").select("id, transaction_id, settled_transaction_id").or(`transaction_id.in.(${list}),settled_transaction_id.in.(${list})`),
  ]);
  return { transactions: t.data ?? [], splits: sp.data ?? [], tags: tg.data ?? [], owed: ow.data ?? [] };
}

/** Deletes at once and hands back what was removed, for the Undo bar. */
export async function deleteTransaction(id: string): Promise<{ error?: string; removed?: Removed }> {
  const { supabase } = await getSession();
  const removed = await takeSnapshot(supabase, [id]);
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return { error: "Couldn’t delete it. Try again." };
  revalidatePath("/", "layout");
  return { removed };
}

/** Undo for a delete: the transactions, their splits and tags go back with the same ids, and IOUs are hooked up again. */
export async function restoreTransactions(removed: Removed): Promise<FormState> {
  const { supabase } = await getSession();
  if (removed.transactions.length) {
    const { error } = await supabase.from("transactions").insert(removed.transactions);
    if (error) return { error: "Couldn’t bring it back." };
  }
  const [sp, tg] = await Promise.all([
    removed.splits.length ? supabase.from("splits").insert(removed.splits) : null,
    removed.tags.length ? supabase.from("transaction_tags").insert(removed.tags) : null,
  ]);
  if (sp?.error || tg?.error) return { error: "Brought it back, but not all of its parts." };
  await Promise.all(removed.owed.map((o) => supabase.from("owed").update({ transaction_id: o.transaction_id, settled_transaction_id: o.settled_transaction_id }).eq("id", o.id)));
  revalidatePath("/", "layout");
  return { ok: "Brought back." };
}

export async function updateDisplayName(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "display_name");
  if (!name) return { error: "Enter a name." };
  const { supabase, userId } = await getSession();
  const { error } = await supabase.from("members").update({ display_name: name }).eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Name saved" };
}

/** Your picture: an emoji, a small photo (resized in the browser to a data URL), or null for initials. */
/** Your own password, for signing in without an emailed code. */
export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const { supabase } = await getSession();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: "Saved. Sign in with your email and this password from now on." };
}

export async function updateAvatar(avatar: string | null): Promise<FormState> {
  const photo = avatar?.startsWith("data:image/");
  if (avatar && photo && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 150_000)) return { error: "That photo didn’t come through. Try another." };
  if (avatar && !photo && ([...avatar].length > 8 || /[\p{L}\p{N}<>]/u.test(avatar))) return { error: "Pick one emoji." };
  const { supabase, userId } = await getSession();
  const { error } = await supabase.from("members").update({ avatar: avatar || null }).eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

/**
 * Owner only. The invite is a join link (/join/<token>) for the owner to send however they like: no email setup
 * needed. Whoever opens it within 7 days picks a password for the invited email and lands in this household.
 */
export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter an email address." };
  return joinLink(email);
}

/** A fresh join link for someone already invited; the old link stops working. */
export async function renewInvite(email: string): Promise<FormState> {
  return joinLink(email);
}

async function joinLink(email: string): Promise<FormState> {
  const { supabase } = await getSession();
  const { data: token, error } = await supabase.rpc("invite_member", { invite_email: email });
  if (error) return { error: error.message === "only the owner can invite people" ? "Only the household’s owner can invite people." : error.message };
  const origin = (await headers()).get("origin") ?? "";
  revalidatePath("/settings");
  return { ok: `Send this link to ${email}. It works once, for 7 days.`, link: `${origin}/join/${token}` };
}

export async function addAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { error: "Name the account." };
  const { supabase, householdId, accounts } = await getHousehold();
  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    name,
    institution: text(form, "institution") || null,
    kind: text(form, "kind").toLowerCase().replace(/\s+/g, "_") || "chequing",
    is_debt: form.get("is_debt") === "on",
    sort: accounts.length + 1,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: `Added ${name}` };
}

export async function setAccountArchived(id: string, archived: boolean) {
  const { supabase } = await getSession();
  await supabase.from("accounts").update({ archived }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function addBucket(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { error: "Name the bucket." };
  const budget = text(form, "budget");
  const budgetCents = budget ? parseAmount(budget) : null;
  if (budget && budgetCents === null) return { error: "Enter the budget as an amount, like 600." };
  const { supabase, householdId, buckets } = await getHousehold();

  // a bucket inside another wears its parent's color, and its icon when the name suggests none
  const parentId = text(form, "parent_id") || null;
  const parent = parentId ? buckets.find((b) => b.id === parentId) : undefined;
  const { data, error } = await supabase.from("buckets").insert({
    household_id: householdId,
    name,
    parent_id: parentId,
    kind: text(form, "kind").toLowerCase() || "spend",
    icon: text(form, "icon").toLowerCase() || guessIcon(name) || parent?.icon || null,
    color: parent ? parent.color ?? seedColor(parent.id) : null,
  }).select("id").single();
  if (error) return { error: error.code === "23505" ? `There is already a bucket called ${name}.` : error.message };

  if (budgetCents) {
    const { error: budgetError } = await supabase.from("budgets")
      .insert({ household_id: householdId, bucket_id: data.id, amount_cents: budgetCents, period: "month" });
    if (budgetError) return { error: budgetError.message };
  }
  revalidatePath("/", "layout");
  return { ok: `Added ${name}` };
}

/**
 * Set (or remove) a bucket's budget from this month on. Earlier months keep the budget they had: the old row
 * ends on the last day of last month, and a row that already starts this month is replaced.
 */
export async function setBudget(_prev: FormState, form: FormData): Promise<FormState> {
  const bucketId = text(form, "bucket_id");
  const remove = form.get("remove") === "1";
  const period = text(form, "period") === "year" ? "year" : "month";
  const cents = parseAmount(text(form, "amount"));
  const rollover = period === "month" && form.get("rollover") === "on";
  if (!remove && (cents === null || cents <= 0)) return { error: "Enter the budget as an amount, like 600." };
  const [{ supabase, householdId, buckets }, today] = await Promise.all([getHousehold(), getToday()]);
  const bucket = buckets.find((b) => b.id === bucketId && !b.archived && !b.parent_id);
  if (!bucket) return { error: "Pick a bucket for the budget." };

  const starts = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastMonthEnd = isoDate(new Date(today.getFullYear(), today.getMonth(), 0));
  // the new row goes in first, so a failure leaves the old budget as it was
  let keep: string | null = null;
  if (!remove) {
    const { data, error } = await supabase.from("budgets")
      .insert({ household_id: householdId, bucket_id: bucket.id, amount_cents: cents, period, starts, attrs: rollover ? { rollover: true } : {} }).select("id").single();
    if (error) return { error: "Couldn’t save the budget. Try again." };
    keep = data.id;
  }
  let replaced = supabase.from("budgets").delete().eq("bucket_id", bucket.id).gte("starts", starts);
  if (keep) replaced = replaced.neq("id", keep);
  const [gone, ended] = await Promise.all([
    replaced,
    supabase.from("budgets").update({ ends: lastMonthEnd }).eq("bucket_id", bucket.id).lt("starts", starts)
      .or(`ends.is.null,ends.gte.${starts}`),
  ]);
  if (gone.error || ended.error) return { error: "Couldn’t save the budget. Try again." };
  revalidatePath("/", "layout");
  return { ok: remove ? `Removed the ${bucket.name} budget` : `${bucket.name}: ${formatCents(cents!, { sign: false })} a ${period}${rollover ? ", carried over" : ""}` };
}

export async function setBucketArchived(id: string, archived: boolean) {
  const { supabase } = await getSession();
  await supabase.from("buckets").update({ archived }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setBucketIcon(id: string, icon: string): Promise<FormState> {
  const clean = icon.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(clean)) return { error: "Pick an icon from the grid." };
  const { supabase } = await getSession();
  const { error } = await supabase.from("buckets").update({ icon: clean }).eq("id", id);
  if (error) return { error: "Couldn’t change the icon. Try again." };
  revalidatePath("/", "layout");
  return { ok: "Icon changed" };
}

export async function signOut() {
  const { supabase } = await getSession();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Save the current Analysis view under a name; saving an existing name replaces it. */
export async function saveView(name: string, query: string, page: "analysis" | "activity" = "analysis"): Promise<FormState> {
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "Give the view a name." };
  const { supabase } = await getSession();
  const { error } = await supabase.from("saved_views").upsert({ name: clean, page, query: query.replace(/^\?/, "").slice(0, 1000) }, { onConflict: "household_id,page,name" });
  if (error) return { error: "Couldn’t save the view. Try again." };
  revalidatePath(page === "activity" ? "/transactions" : "/analysis");
  return { ok: `Saved “${clean}”.` };
}

export async function deleteView(id: string) {
  const { supabase } = await getSession();
  await supabase.from("saved_views").delete().eq("id", id);
  revalidatePath("/analysis");
  revalidatePath("/transactions");
}

/**
 * Add or edit a goal: a bucket of kind "goal" with a target, an optional date, and where its progress comes
 * from (money moved into the goal, or a linked account's balance in attrs.account_id).
 */
export async function saveGoal(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const target = parseAmount(text(form, "target"));
  const date = text(form, "target_date");
  const account = text(form, "account_id");
  if (!name) return { error: "Name the goal." };
  if (target === null || target <= 0) return { error: "Enter the target, like 2000." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date, or leave it empty." };
  const { supabase, householdId, buckets } = await getHousehold();
  const existing = id ? buckets.find((b) => b.id === id) : undefined;
  const attrs = { ...(existing?.attrs ?? {}) } as Record<string, unknown>;
  if (account) attrs.account_id = account; else delete attrs.account_id;
  const values = { name, target_cents: target, target_date: date || null, attrs, kind: existing?.kind ?? "goal", icon: text(form, "icon") || existing?.icon || "piggy-bank" };
  const { error } = id
    ? await supabase.from("buckets").update(values).eq("id", id)
    : await supabase.from("buckets").insert({ ...values, household_id: householdId, color: "7" });
  if (error) return { error: error.code === "23505" ? `There is already a bucket called ${name}.` : "Couldn’t save the goal. Try again." };
  revalidatePath("/", "layout");
  return { ok: id ? `Saved ${name}.` : `Added ${name}.` };
}

/** Delete a goal. Its transactions keep their amounts but lose this bucket (they show under Needs a look). */
export async function deleteGoal(id: string): Promise<FormState> {
  const { supabase } = await getSession();
  const { error } = await supabase.from("buckets").delete().eq("id", id);
  if (error) return { error: "Couldn’t delete the goal. Archive it instead." };
  revalidatePath("/", "layout");
  return { ok: "Deleted." };
}

/**
 * Change many transactions at once. A bucket only goes on transactions with a single split (a split receipt keeps
 * its parts), and choosing a bucket also clears "needs a look". Every change is in `history`, so it can be undone.
 */
export type Before = { id: string; merchant: string; needs_review: boolean; splits: { id: string; bucket_id: string | null }[] }[];

export async function bulkUpdate(ids: string[], change: { bucketId?: string | null; merchant?: string; needsReview?: boolean }): Promise<FormState & { before?: Before }> {
  if (ids.length === 0) return { error: "Select some transactions first." };
  const { supabase } = await getSession();
  // what they were, for the Undo bar
  const { data: was } = await supabase.from("transactions").select("id, merchant, needs_review, splits(id, bucket_id)").in("id", ids);
  const before = (was ?? []) as Before;
  let done = 0, skipped = 0;
  if (change.bucketId !== undefined) {
    const { data: splits } = await supabase.from("splits").select("id, transaction_id").in("transaction_id", ids);
    const count = new Map<string, number>();
    for (const sp of splits ?? []) count.set(sp.transaction_id, (count.get(sp.transaction_id) ?? 0) + 1);
    const single = ids.filter((id) => count.get(id) === 1);
    skipped = ids.length - single.length;
    if (single.length) {
      const { error } = await supabase.from("splits").update({ bucket_id: change.bucketId }).in("transaction_id", single);
      if (error) return { error: "Couldn’t change the bucket. Try again." };
      await supabase.from("transactions").update({ needs_review: false }).in("id", single);
      done = single.length;
    }
  }
  const values: Record<string, unknown> = {};
  if (change.merchant !== undefined) {
    const name = change.merchant.trim();
    if (!name) return { error: "Type the new name." };
    values.merchant = name;
  }
  if (change.needsReview !== undefined) values.needs_review = change.needsReview;
  if (Object.keys(values).length) {
    const { error } = await supabase.from("transactions").update(values).in("id", ids);
    if (error) return { error: "Couldn’t save the change. Try again." };
    done = ids.length;
  }
  revalidatePath("/", "layout");
  const n = (k: number) => `${k} transaction${k === 1 ? "" : "s"}`;
  return { before, ok: skipped ? `Updated ${n(done)}. ${n(skipped)} split across buckets ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it is" : "they are"}.` : `Updated ${n(done)}.` };
}

/** Undo for an edit: names, "needs a look" and each split's bucket go back to what they were. */
export async function restoreEdits(before: Before): Promise<FormState> {
  const { supabase } = await getSession();
  const results = await Promise.all([
    ...before.map((t) => supabase.from("transactions").update({ merchant: t.merchant, needs_review: t.needs_review }).eq("id", t.id)),
    ...before.flatMap((t) => t.splits.map((sp) => supabase.from("splits").update({ bucket_id: sp.bucket_id }).eq("id", sp.id))),
  ]);
  if (results.some((r) => r.error)) return { error: "Couldn’t undo all of it." };
  revalidatePath("/", "layout");
  return { ok: "Undone." };
}

export async function bulkDelete(ids: string[]): Promise<FormState & { removed?: Removed }> {
  if (ids.length === 0) return { error: "Select some transactions first." };
  const { supabase } = await getSession();
  const removed = await takeSnapshot(supabase, ids);
  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) return { error: "Couldn’t delete them. Try again." };
  revalidatePath("/", "layout");
  return { removed, ok: `Deleted ${ids.length} transaction${ids.length === 1 ? "" : "s"}.` };
}

/**
 * "Not a bill": a charge that looked regular but isn't. Saved as an inactive `recurring` row that leaves the
 * merchant out of bill detection (on this account only, when given). Returns the row's id so Undo can remove it.
 */
export async function notABill(merchant: string, accountId?: string | null): Promise<FormState & { id?: string }> {
  const name = merchant.trim();
  if (!name) return { error: "No charge given." };
  const { supabase, householdId } = await getHouseholdId();
  const { data, error } = await supabase.from("recurring").insert({
    household_id: householdId, merchant: name, amount_cents: 0, account_id: accountId ?? null, active: false,
    attrs: { exclude_from_detection: true, about: "Marked “not a bill” in the app" },
  }).select("id").single();
  if (error) return { error: "Couldn’t save that. Try again." };
  revalidatePath("/", "layout");
  return { ok: `${name} won’t show as a bill.`, id: data.id };
}

/** Undo for "Not a bill". */
export async function undoNotABill(id: string): Promise<FormState> {
  const { supabase } = await getSession();
  const { error } = await supabase.from("recurring").delete().eq("id", id).eq("active", false);
  if (error) return { error: "Couldn’t undo that." };
  revalidatePath("/", "layout");
  return { ok: "It’s a bill again." };
}

/** The weekly check-in is done: remembered (when and by whom) so the next one counts from here. */
export async function finishCheckIn(): Promise<FormState & { previous?: unknown }> {
  const { supabase, householdId, userId } = await getHouseholdId();
  const { data: was } = await supabase.from("settings").select("value").eq("household_id", householdId).eq("key", "checkin").maybeSingle();
  const { error } = await supabase.from("settings").upsert({ household_id: householdId, key: "checkin", value: { at: new Date().toISOString(), by: userId } }, { onConflict: "household_id,key" });
  if (error) return { error: "Couldn’t save that. Try again." };
  revalidatePath("/", "layout");
  return { ok: "Checked in.", previous: was?.value ?? null };
}

/** Undo for finishing a check-in. */
export async function undoCheckIn(previous: unknown): Promise<FormState> {
  const { supabase, householdId } = await getHouseholdId();
  const { error } = previous
    ? await supabase.from("settings").upsert({ household_id: householdId, key: "checkin", value: previous }, { onConflict: "household_id,key" })
    : await supabase.from("settings").delete().eq("household_id", householdId).eq("key", "checkin");
  if (error) return { error: "Couldn’t undo that." };
  revalidatePath("/", "layout");
  return { ok: "Undone." };
}

// ---------------------------------------------------------------------------
// Money lent and paid back. An IOU is a row in `owed` (positive = they owe us). The transaction itself moves to
// the "lent" bucket, so lending isn't counted as our spending and getting it back isn't counted as income.
// ---------------------------------------------------------------------------

/** Rows still open for one person in one currency (rows in the household's own currency carry no repayment_currency). */
async function openOwed(person: string, currency = CURRENCY) {
  const { supabase } = await getSession();
  let q = supabase.from("owed").select("id, amount_cents").eq("person", person).is("settled_on", null);
  q = currency === CURRENCY
    ? q.or(`attrs->>repayment_currency.is.null,attrs->>repayment_currency.eq.${CURRENCY}`)
    : q.eq("attrs->>repayment_currency", currency);
  const { data } = await q;
  return (data ?? []) as { id: string; amount_cents: number }[];
}

async function moveToLent(transactionId: string) {
  const { supabase } = await getSession();
  const { data: lent } = await supabase.from("buckets").select("id").eq("kind", "lent").eq("archived", false).order("sort").order("name").limit(1).maybeSingle();
  if (lent) await bulkUpdate([transactionId], { bucketId: lent.id });
}

/** "Someone owes us for this": money out that was lent, or paid on someone's behalf. */
export async function lendFromTransaction(transactionId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const person = text(form, "person");
  const cents = parseAmount(text(form, "amount"));
  const due = text(form, "due_date");
  if (!person) return { error: "Who owes you? Type their name." };
  if (cents === null || cents <= 0) return { error: "Enter how much they owe, like 40.00." };
  const { supabase } = await getSession();
  const { data: t } = await supabase.from("transactions").select("amount_cents, date, merchant").eq("id", transactionId).maybeSingle();
  if (!t) return { error: "That transaction is gone." };
  if (cents > Math.abs(t.amount_cents)) return { error: "That’s more than this transaction." };
  const { error } = await supabase.from("owed").insert({
    person, amount_cents: cents, reason: text(form, "reason") || t.merchant, date: t.date,
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null, transaction_id: transactionId,
  });
  if (error) return { error: "Couldn’t save that. Try again." };
  // all of it was theirs: it's not our spending at all (a share of a bigger bill stays where it is)
  if (cents === Math.abs(t.amount_cents)) await moveToLent(transactionId);
  revalidatePath("/", "layout");
  return { ok: `Saved. ${person} owes you for this.` };
}

/** "Paid back by…": money in that settles (all or part of) what someone owed. */
export async function repaidByTransaction(transactionId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const person = text(form, "person");
  if (!person) return { error: "Pick who paid you back." };
  const { supabase } = await getSession();
  const { data: t } = await supabase.from("transactions").select("amount_cents, date").eq("id", transactionId).maybeSingle();
  if (!t || t.amount_cents <= 0) return { error: "Only money coming in can be a repayment." };
  const open = await openOwed(person);
  const owing = open.reduce((s, r) => s + r.amount_cents, 0);
  if (owing <= 0) return { error: `${person} doesn’t owe you anything right now.` };
  if (t.amount_cents >= owing) {
    // all paid: close every open IOU, pointing at this payment
    const { error } = await supabase.from("owed").update({ settled_on: t.date, settled_transaction_id: transactionId }).in("id", open.map((r) => r.id));
    if (error) return { error: "Couldn’t save that. Try again." };
  } else {
    // part paid: a row the other way, so what's left is still open
    const { error } = await supabase.from("owed").insert({
      person, amount_cents: -t.amount_cents, reason: "Paid back", date: t.date, transaction_id: transactionId, attrs: { repayment: true },
    });
    if (error) return { error: "Couldn’t save that. Try again." };
  }
  await moveToLent(transactionId);
  revalidatePath("/", "layout");
  const left = owing - t.amount_cents;
  return { ok: left > 0 ? `Saved. ${person} still owes you ${formatCents(left, { sign: false })}.` : `Saved. ${person} is all paid up.` };
}

/** Everything one person owes (or is owed) is settled, without a matching transaction: cash, or a favour. */
export async function settleOwed(person: string, currency = CURRENCY): Promise<FormState> {
  const open = await openOwed(person, currency);
  if (!open.length) return { ok: "Already settled." };
  const { supabase } = await getSession();
  const { error } = await supabase.from("owed").update({ settled_on: isoDate(await getToday()) }).in("id", open.map((r) => r.id));
  if (error) return { error: "Couldn’t settle that. Try again." };
  revalidatePath("/", "layout");
  return { ok: `Settled with ${person}.` };
}
