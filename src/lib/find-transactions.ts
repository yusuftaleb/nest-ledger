import type { getHousehold } from "./household";
import { matchesTransaction, type Slice } from "./search";
import { TX_SELECT, type TransactionRow } from "./types";

/**
 * Transactions matching a search, newest first. The date range, accounts, people and words narrow the database
 * query; buckets, kinds, amounts and flags are checked here, so every match is found, not just a first page.
 */
export async function findTransactions(h: Awaited<ReturnType<typeof getHousehold>>, slice: Slice): Promise<{ rows: TransactionRow[]; error: string | null }> {
  let query = h.supabase.from("transactions").select(TX_SELECT)
    .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(20000);
  if (slice.from) query = query.gte("date", slice.from);
  if (slice.to) query = query.lt("date", slice.to);
  if (slice.accounts.length) query = query.in("account_id", slice.accounts);
  if (slice.people.length) query = query.in("created_by", slice.people);
  for (const w of slice.text) {
    const safe = w.replace(/[%_,()*]/g, " ").trim();
    if (safe) query = query.or(`merchant.ilike.%${safe}%,note.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  return { rows: ((data ?? []) as TransactionRow[]).filter((t) => matchesTransaction(t, slice, h.buckets)), error: error?.message ?? null };
}
