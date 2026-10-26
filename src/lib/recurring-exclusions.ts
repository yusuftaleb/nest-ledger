export type RecurringExclusion = { merchant: string; account_id: string | null };

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Saved merchant exclusions apply to future charges as well as the imported history. */
export function applyRecurringExclusions<L extends { merchant: string; account_id: string }>(
  lines: L[], exclusions: RecurringExclusion[],
): (L & { exclude_from_recurring?: boolean })[] {
  const patterns = exclusions.map((e) => ({ ...e, merchant: normalize(e.merchant) })).filter((e) => e.merchant);
  return lines.map((line) => patterns.some((e) =>
    (!e.account_id || e.account_id === line.account_id) && normalize(line.merchant).includes(e.merchant),
  ) ? { ...line, exclude_from_recurring: true } : line);
}
