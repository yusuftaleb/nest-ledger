import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOwed, groupOwed, owedAmount, owedTotals, type OwedEntry } from "./owed.ts";

const entry = (amount_cents: number, attrs: Record<string, unknown> = {}, person = "Friend"): OwedEntry => ({
  person, amount_cents, date: "2026-01-17", due_date: null, attrs,
});

test("euro principal is repaid in euros while its CAD valuation is preserved", () => {
  const rows = groupOwed([
    entry(16000, { repayment_currency: "EUR", repayment_amount_cents: 10000 }),
    entry(8000, { repayment_currency: "EUR", repayment_amount_cents: 5000 }),
    entry(-8200, { repayment_currency: "EUR", repayment_amount_cents: -5000 }),
    entry(64), entry(19488, {}, "Other friend"),
  ]);
  assert.equal(rows.length, 3);
  const eur = rows.find((r) => r.currency === "EUR")!;
  assert.equal(owedAmount(eur), 10000);
  assert.equal(eur.amount_cents, 15800);
  assert.match(owedTotals(rows), /€100\.00 EUR/);
  assert.match(owedTotals(rows), /\$195\.52 CAD/);
  assert.equal(formatOwed(72180, "EUR"), "€721.80 EUR");
});

test("legacy CAD, negative IOUs, zero corrections and due dates stay correct", () => {
  const rows = groupOwed([entry(0), entry(-5000), { ...entry(-2000), date: "2025-12-01", due_date: "2026-04-01" }]);
  assert.equal(rows.length, 1);
  assert.equal(owedAmount(rows[0]), -7000);
  assert.equal(rows[0].items, 2);
  assert.equal(rows[0].since, "2025-12-01");
  assert.equal(rows[0].next_due, "2026-04-01");
  assert.deepEqual(groupOwed([entry(500), entry(-500)]), []);
});

test("foreign IOUs cannot silently fall back to CAD cents or fractional cents", () => {
  assert.throws(() => groupOwed([entry(16000, { repayment_currency: "EUR" })]));
  assert.throws(() => groupOwed([entry(16000, { repayment_currency: "EUR", repayment_amount_cents: 1.5 })]));
});
