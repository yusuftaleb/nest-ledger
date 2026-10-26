// Undo sends back what the browser was given when something was deleted or changed. The browser can't be trusted
// with that, so before anything is written again it is narrowed to this household and to the things it came with.
// Row-level security already refuses rows for another household; this is the second lock.

export type Removed = {
  transactions: Record<string, unknown>[]; splits: Record<string, unknown>[]; tags: Record<string, unknown>[];
  /** IOUs that pointed at these transactions (the database unhooks them on delete). */
  owed: { id: string; transaction_id: string | null; settled_transaction_id: string | null }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * Only this household's transactions come back, and only the splits, tags and IOU links that belong to them.
 * Anything else in the payload is dropped, not written.
 */
export function restorable(removed: Removed, householdId: string): Removed {
  const transactions = (removed.transactions ?? []).filter((t) => isId(t.id) && t.household_id === householdId);
  const ids = new Set(transactions.map((t) => t.id as string));
  const ours = (v: unknown) => v === null || (isId(v) && ids.has(v));
  return {
    transactions,
    splits: (removed.splits ?? []).filter((s) => isId(s.transaction_id) && ids.has(s.transaction_id)),
    tags: (removed.tags ?? []).filter((t) => isId(t.transaction_id) && ids.has(t.transaction_id) && isId(t.tag_id)),
    owed: (removed.owed ?? []).filter((o) => isId(o.id) && ours(o.transaction_id) && ours(o.settled_transaction_id)
      && (o.transaction_id !== null || o.settled_transaction_id !== null)),
  };
}

/** The last weekly check-in as the app writes it ({"at": time, "by": user id}), or null; anything else is refused. */
export function checkInValue(v: unknown): { at: string; by: string } | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const { at, by, ...rest } = v as Record<string, unknown>;
  if (Object.keys(rest).length || typeof at !== "string" || Number.isNaN(Date.parse(at)) || !isId(by)) return undefined;
  return { at, by };
}
