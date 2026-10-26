// Shapes of the rows the app reads. Most "kind" fields are free text on purpose:
// an agent can add new values and the app shows them without a code change.

type Attrs = Record<string, unknown>;

export type Member = {
  user_id: string; household_id: string; display_name: string; email: string;
  /** An emoji, or a small photo as a data URL; null shows initials. */
  avatar?: string | null;
  /** "owner" (set the household up; can invite people) or "member". */
  role?: string;
};
export type Account = {
  id: string; name: string; institution: string | null; kind: string; currency: string;
  owner_id: string | null; is_debt: boolean; archived: boolean; sort: number; attrs: Attrs;
};
export type Bucket = {
  id: string; name: string; parent_id: string | null; kind: string; icon: string | null; color: string | null;
  sort: number; archived: boolean; target_cents: number | null; target_date: string | null; attrs: Attrs;
};
export type Rule = { pattern: string; bucket_id: string };
export type Budget = { id: string; bucket_id: string; amount_cents: number; period: string; starts: string; ends: string | null;
  /** {"rollover": true}: what's left (or over) at the end of a month carries into the next. */
  attrs?: Record<string, unknown> | null };
export type Widget = { id: string; page: string; position: number; type: string; title: string | null; spec: Attrs };

export type TransactionRow = {
  id: string; date: string; merchant: string; amount_cents: number;
  source: string; needs_review: boolean; verified: boolean; note: string | null; account_id: string; created_by: string | null;
  orig_currency: string | null; orig_amount: number | null;
  splits: { amount_cents: number; bucket_id: string | null }[];
};

/** A row of the `lines` view: one split with its account, bucket path, kind and person. */
export type Line = {
  split_id: string; transaction_id: string; date: string; month: string; merchant: string; amount_cents: number;
  account_id: string; account: string; bucket_id: string | null; bucket: string; top_bucket: string;
  kind: string; person: string | null; source: string; needs_review: boolean; verified: boolean; tags: string[];
  /** Shared by the two sides of a move between our own accounts. */
  transfer_id?: string | null;
  /** Saved household instruction to omit this merchant from bill detection. */
  exclude_from_recurring?: boolean;
};
/** One person's open IOUs, from the owed_by_person view. Positive = they owe us, negative = we owe them. */
export type OwedRow = {
  person: string; amount_cents: number; items: number; since: string; next_due: string | null;
  /** Repayment denomination; amount_cents remains the valuation in the household's currency. */
  currency?: string; repayment_amount_cents?: number;
  /** What the open IOUs were for ("dinner"), when someone wrote it down. */
  reasons?: string[];
};

/** Suggestions for the free-text fields; anything else is allowed too. */
export const ACCOUNT_KINDS = ["chequing", "savings", "credit_card", "cash", "student_loan", "line_of_credit", "investments", "other"];
export const BUCKET_KINDS = ["spend", "income", "transfer", "saving", "goal"];

export const TX_SELECT =
  "id, date, merchant, amount_cents, source, needs_review, verified, note, account_id, created_by, orig_currency, orig_amount, splits(amount_cents, bucket_id)";

export const needsLook = (t: TransactionRow) => t.needs_review || t.splits.length === 0 || t.splits.some((s) => !s.bucket_id);
