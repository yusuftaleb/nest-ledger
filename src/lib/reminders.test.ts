import assert from "node:assert/strict";
import { test } from "node:test";
import { dueSoon } from "./reminders.ts";

const bill = (merchant: string, day: number, paid: number | null) => ({ merchant, bucket: "Housing", amount: 150000, day, paid, paidOn: null });

test("bills due in the next three days, this month's and early next month's", () => {
  const today = new Date(2026, 9, 29);
  const soon = dueSoon([bill("Rent", 1, 150000), bill("Phone", 30, null), bill("Hydro", 12, null), bill("Gym", 20, null), bill("Netflix", 31, 1700)], today);
  // rent was paid this month and comes again on Nov 1; the phone is due tomorrow; hydro is late, not "soon"
  assert.deepEqual(soon.map((s) => [s.merchant, s.date, s.days]), [["Phone", "2026-10-30", 1], ["Rent", "2026-11-01", 3]]);
});

test("a bill due on the 31st falls on the last day of a shorter month", () => {
  const soon = dueSoon([bill("Insurance", 31, null)], new Date(2026, 10, 28));
  assert.deepEqual(soon.map((s) => s.date), ["2026-11-30"]);
});
