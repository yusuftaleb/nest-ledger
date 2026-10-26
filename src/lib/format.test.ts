import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The settings are read once when the module loads, so each household is tried in its own process.
function asHousehold(env: Record<string, string>, code: string): unknown {
  const script = `
    import { formatCents, formatCompact } from "./src/lib/money.ts";
    import { weekdayIndex, weekdayNames } from "./src/lib/format.ts";
    console.log(JSON.stringify(${code}));`;
  const out = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], {
    env: { ...process.env, ...env }, encoding: "utf8",
  });
  return JSON.parse(out);
}

test("the default copy writes Canadian dollars, with Monday first", () => {
  assert.deepEqual(
    asHousehold({}, `[formatCents(-1450), formatCents(120000, { sign: false, trim: true }), formatCompact(124000), weekdayNames("short")[0], weekdayIndex(new Date(2026, 9, 26))]`),
    ["−$14.50", "$1,200", "$1.2K", "Mon", 0],
  );
});

test("a household in Germany sees euros, German numbers and Sunday first", () => {
  const [spent, whole, sunday, monday] = asHousehold(
    { NEXT_PUBLIC_CURRENCY: "eur", NEXT_PUBLIC_LOCALE: "de-DE", NEXT_PUBLIC_WEEK_START: "0" },
    `[formatCents(-1450), formatCents(120000, { sign: false, trim: true }), weekdayIndex(new Date(2026, 9, 25)), weekdayIndex(new Date(2026, 9, 26))]`,
  ) as [string, string, number, number];
  assert.equal(spent.replace(/\s/g, " "), "−14,50 €");
  assert.equal(whole.replace(/\s/g, " "), "1.200 €");
  assert.equal(sunday, 0);
  assert.equal(monday, 1);
});

test("a US household keeps cents off whole amounts and starts the week on Sunday", () => {
  assert.deepEqual(
    asHousehold({ NEXT_PUBLIC_CURRENCY: "USD", NEXT_PUBLIC_LOCALE: "en-US", NEXT_PUBLIC_WEEK_START: "0" },
      `[formatCents(999, { sign: false }), formatCents(5000, { sign: false, trim: true }), formatCompact(-1234500), weekdayNames("short")[0]]`),
    ["$9.99", "$50", "−$12K", "Sun"],
  );
});
