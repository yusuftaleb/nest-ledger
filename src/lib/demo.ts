import { CURRENCY } from "./format.ts";
import type { DashboardSource, Balance } from "./dashboard-source";
import { isoDate } from "./dates";
import { withFamilyColors } from "./buckets";
import type { Account, Budget, Bucket, Line, Member, TransactionRow, Widget } from "./types";

// A made-up household for the dev-only /demo pages: 14 months of believable student-family money,
// generated from a fixed seed so every reload (and every screenshot) shows the same numbers.

const DEMO_WIDGETS: Omit<Widget, "id">[] = [
  { page: "home", position: 10, type: "summary", title: null, spec: { span: "full" } },
  { page: "home", position: 20, type: "balances", title: "Balances", spec: { span: "half" } },
  { page: "home", position: 30, type: "budgets", title: "Budgets", spec: { limit: 4, span: "half" } },
  { page: "home", position: 40, type: "insights", title: "Worth knowing", spec: { span: "half" } },
  { page: "home", position: 50, type: "recent", title: "Recent", spec: { limit: 5, span: "half" } },
  { page: "plan", position: 10, type: "goals", title: "Goals", spec: { span: "wide" } },
  { page: "plan", position: 20, type: "upcoming", title: "Coming up", spec: { span: "third" } },
  { page: "plan", position: 30, type: "budgets", title: "Budgets", spec: { limit: 0, span: "full" } },
  { page: "plan", position: 40, type: "net_worth", title: "Net worth", spec: { span: "wide" } },
  { page: "plan", position: 50, type: "owed", title: "Money owed", spec: { span: "third" } },
  { page: "plan", position: 60, type: "debts", title: "Debt-free plan", spec: { method: "avalanche", extra: 0, span: "full" } },
  { page: "analysis", position: 10, type: "outlook", title: "Insights", spec: { span: "full" } },
  { page: "analysis", position: 20, type: "savings_rate", title: "Savings rate", spec: { months: 12, span: "half" } },
  { page: "analysis", position: 30, type: "cashflow", title: "Money in and out", spec: { months: 12, span: "half" } },
];

const ME = "demo-you", PARTNER = "demo-partner";
const members: Member[] = [
  { user_id: ME, household_id: "demo", display_name: "Alex", email: "you@example.com" },
  { user_id: PARTNER, household_id: "demo", display_name: "Sam", email: "partner@example.com" },
];

const acct = (id: string, name: string, institution: string | null, kind: string, is_debt: boolean, sort: number, attrs: Account["attrs"] = {}): Account =>
  ({ id, name, institution, kind, currency: CURRENCY, owner_id: null, is_debt, archived: false, sort, attrs });
const accounts: Account[] = [
  acct("chq", "Everyday chequing", "Northside", "chequing", false, 1),
  acct("joint", "Joint credit card", "Northside", "credit_card", true, 2, { apr: 20.99, min_payment_cents: 3000 }),
  acct("card2", "Sam’s card", "Harbor Credit", "credit_card", true, 3, { apr: 19.99, min_payment_cents: 1000 }),
  acct("rewards", "Rewards card", "Harbor Credit", "credit_card", true, 4, { apr: 21.99, min_payment_cents: 1000 }),
  acct("globe", "Globe wallet", "Globe", "chequing", false, 5),
  acct("cash", "Cash", null, "cash", false, 6),
];

const bk = (id: string, name: string, kind: string, icon: string, color: string, sort: number, parent_id: string | null = null, extra: Partial<Bucket> = {}): Bucket =>
  ({ id, name, parent_id, kind, icon, color, sort, archived: false, target_cents: null, target_date: null, attrs: {}, ...extra });
const buckets: Bucket[] = [
  bk("groc", "Groceries", "spend", "shopping-cart", "1", 1),
  bk("baby", "Baby", "spend", "baby", "2", 2),
  bk("diap", "Diapers & wipes", "spend", "package", "2", 1, "baby"),
  bk("form", "Formula & food", "spend", "milk", "2", 2, "baby"),
  bk("gear", "Baby clothes & gear", "spend", "shirt", "2", 3, "baby"),
  bk("rent", "Rent & utilities", "spend", "house", "3", 3),
  bk("phone", "Phone & internet", "spend", "wifi", "3", 4),
  bk("trans", "Transportation", "spend", "bus", "4", 5),
  bk("edu", "Education", "spend", "graduation-cap", "7", 6),
  bk("health", "Health & personal care", "spend", "heart-pulse", "6", 7),
  bk("house", "Household supplies", "spend", "spray-can", "8", 8),
  bk("eat", "Eating out", "spend", "utensils", "5", 9),
  bk("cloth", "Clothing", "spend", "shirt", "6", 10),
  bk("subs", "Subscriptions", "spend", "repeat", "4", 11),
  bk("fun", "Entertainment", "spend", "popcorn", "5", 12),
  bk("gift", "Gifts", "spend", "gift", "6", 13),
  bk("wages", "Pay", "income", "banknote", "1", 20),
  bk("schol", "Scholarships", "income", "graduation-cap", "7", 21),
  bk("aid", "Student aid", "income", "landmark", "3", 22),
  bk("ccb", "Child benefit", "income", "hand-coins", "1", 23),
  bk("gst", "Tax credit", "income", "hand-coins", "3", 24),
  bk("ccpay", "Credit card payment", "transfer", "credit-card", "8", 30),
  bk("betw", "Between accounts", "transfer", "arrow-left-right", "8", 31),
  bk("lent", "Lent to others", "lent", "hand-coins", "8", 32),
  bk("efund", "Emergency fund", "goal", "piggy-bank", "7", 40, null, { target_cents: 300000 }),
  bk("car", "Used car", "goal", "car", "4", 41, null, { target_cents: 800000, target_date: "2027-08-01" }),
];
const byId = new Map(buckets.map((b) => [b.id, b]));

const budgetRows: Budget[] = ([
  ["groc", 70000], ["baby", 35000], ["rent", 182000], ["phone", 10000], ["trans", 16000], ["eat", 15000],
  ["subs", 4000], ["health", 6000], ["house", 8000], ["fun", 6000],
] as const).map(([bucket_id, amount_cents], i) => ({ id: `bud${i}`, bucket_id, amount_cents, period: "month", starts: "2025-01-01", ends: null }));
budgetRows.push({ id: "bud-cloth", bucket_id: "cloth", amount_cents: 30000, period: "quarter", starts: "2025-01-01", ends: null });

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Split = { bucket: string | null; cents: number };
type Tx = { id: string; date: string; merchant: string; account: string; by: string; splits: Split[]; review?: boolean; verified?: boolean; transfer_id?: string };

function generate(today: Date) {
  const rand = rng(20261025);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const txs: Tx[] = [];
  const end = isoDate(today);
  let n = 0;
  const add = (d: Date, merchant: string, account: string, splits: Split[], by = rand() < 0.55 ? ME : PARTNER, extra: Partial<Tx> = {}) => {
    const date = isoDate(d);
    if (date > end) return;
    txs.push({ id: `t${++n}`, date, merchant, account, by, splits, verified: rand() < 0.7, ...extra });
  };

  for (let back = 13; back >= 0; back--) {
    const y = today.getFullYear(), m = today.getMonth() - back;
    const day = (d: number) => new Date(y, m, d);
    const month = new Date(y, m, 1).getMonth();
    const days = new Date(y, m + 1, 0).getDate();

    add(day(1), "Rent · Parkview Apartments", "chq", [{ bucket: "rent", cents: -165000 }], ME);
    add(day(between(12, 18)), "Toronto Hydro", "chq", [{ bucket: "rent", cents: -between(7200, 12800) }], ME);
    add(day(15), "Freedom Mobile", "joint", [{ bucket: "phone", cents: -9500 }]);
    add(day(2), "Presto", "joint", [{ bucket: "trans", cents: -12800 }]);
    add(day(3), "Netflix", "joint", [{ bucket: "subs", cents: -1899 }]);
    add(day(9), "Spotify", "rewards", [{ bucket: "subs", cents: -1299 }]);
    add(day(11), "iCloud+", "rewards", [{ bucket: "subs", cents: -399 }]);
    add(day(20), "Child benefit", "chq", [{ bucket: "ccb", cents: 64125 }], ME);
    add(day(16), "University · payroll", "chq", [{ bucket: "wages", cents: between(118000, 126000) }], ME);
    add(day(Math.min(30, days)), "University · payroll", "chq", [{ bucket: "wages", cents: between(118000, 126000) }], ME);
    add(day(8), "Campus library · part-time", "card2", [{ bucket: "wages", cents: between(52000, 61000) }], PARTNER);
    add(day(22), "Campus library · part-time", "card2", [{ bucket: "wages", cents: between(52000, 61000) }], PARTNER);
    add(day(25), "Transfer to emergency fund", "chq", [{ bucket: "efund", cents: -25000 }], ME);
    add(day(26), "Transfer to car fund", "chq", [{ bucket: "car", cents: -15000 }], ME);
    // a card payment is one move with two sides: out of chequing, into the card
    const paid = between(90000, 140000), pay = `pay-${y}-${m}`;
    add(day(24), "Payment · Joint credit card", "chq", [{ bucket: "ccpay", cents: -paid }], ME, { transfer_id: pay });
    add(day(24), "Payment received, thank you", "joint", [{ bucket: "ccpay", cents: paid }], ME, { transfer_id: pay });
    const topUp = `globe-${y}-${m}`;
    add(day(10), "Transfer to Globe wallet", "chq", [{ bucket: "betw", cents: -20000 }], ME, { transfer_id: topUp });
    add(day(10), "Top-up from chequing", "globe", [{ bucket: "betw", cents: 20000 }], ME, { transfer_id: topUp });
    if ([0, 3, 6, 9].includes(month)) add(day(5), "Tax credit", "chq", [{ bucket: "gst", cents: 18225 }], ME);
    if (month === 8 || month === 0) {
      add(day(4), "Student aid", "chq", [{ bucket: "aid", cents: 452000 }], ME);
      add(day(6), "University · tuition", "chq", [{ bucket: "edu", cents: -286000 }], ME);
      add(day(9), "Campus bookstore", "joint", [{ bucket: "edu", cents: -between(18000, 32000) }]);
    }
    if (month === 10) add(day(14), "Graduate bursary", "chq", [{ bucket: "schol", cents: 150000 }], ME);
    if (month === 11) {
      add(day(12), "Indigo", "joint", [{ bucket: "gift", cents: -8640 }]);
      add(day(18), "Toys R Us", "rewards", [{ bucket: "gift", cents: -12400 }, { bucket: "gear", cents: -4300 }]);
    }

    for (let d = 1; d <= days; d++) {
      const date = day(d);
      const wd = date.getDay();
      // groceries twice a week, the big Superstore run on Saturdays splits into Baby and Household
      if (wd === 6) {
        const groc = -between(9000, 16500), baby = -between(1800, 4600), house = rand() < 0.5 ? -between(900, 2600) : 0;
        add(date, "Real Canadian Superstore", "rewards", [{ bucket: "groc", cents: groc }, { bucket: "form", cents: baby }, ...(house ? [{ bucket: "house", cents: house }] : [])]);
      }
      if (wd === 3 && rand() < 0.8) add(date, rand() < 0.5 ? "No Frills" : "FreshCo", "joint", [{ bucket: "groc", cents: -between(2400, 6800) }]);
      if (d % 9 === 4) add(date, "Shoppers Drug Mart", "card2", [{ bucket: "diap", cents: -between(3800, 5600) }], PARTNER);
      if ((wd === 1 || wd === 3 || wd === 5) && rand() < 0.65) add(date, "Tim Hortons", "joint", [{ bucket: "eat", cents: -between(380, 1450) }]);
      if (wd === 5 && rand() < 0.45) add(date, rand() < 0.5 ? "Pho Hung" : "Pizza Nova", "joint", [{ bucket: "eat", cents: -between(3200, 7400) }]);
      if (rand() < 0.035) add(date, "Uber", "joint", [{ bucket: "trans", cents: -between(1400, 3200) }]);
      if (rand() < 0.03) add(date, "Rexall", "card2", [{ bucket: "health", cents: -between(1600, 4400) }], PARTNER);
      if (rand() < 0.02) add(date, "Winners", "card2", [{ bucket: "cloth", cents: -between(2800, 7900) }], PARTNER);
      if (rand() < 0.018) add(date, "Cineplex", "joint", [{ bucket: "fun", cents: -between(2400, 4200) }]);
      if (rand() < 0.012) add(date, "Dollarama", "cash", [{ bucket: "house", cents: -between(600, 2200) }]);
    }
  }
  // a little untidiness so "Needs a look" has something to show
  const recent = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  add(recent(1), "AMZN Mktp CA", "rewards", [{ bucket: null, cents: -4799 }], ME, { review: true, verified: false });
  add(recent(3), "Globe · transfer from family", "globe", [{ bucket: null, cents: 30000 }], ME, { review: true, verified: false });
  add(recent(4), "Costco Wholesale", "joint", [{ bucket: "groc", cents: -14820 }, { bucket: "diap", cents: -5299 }], PARTNER, { review: true });
  return txs.sort((a, b) => a.date.localeCompare(b.date));
}

function topOf(b: Bucket | undefined): Bucket | undefined {
  return b?.parent_id ? byId.get(b.parent_id) : b;
}

function toLines(txs: Tx[]): Line[] {
  return txs.flatMap((t) => t.splits.map((s, i) => {
    const b = s.bucket ? byId.get(s.bucket) : undefined;
    return {
      split_id: `${t.id}-${i}`, transaction_id: t.id, date: t.date, month: `${t.date.slice(0, 7)}-01`, merchant: t.merchant,
      amount_cents: s.cents, account_id: t.account, account: accounts.find((a) => a.id === t.account)!.name,
      bucket_id: s.bucket, bucket: b?.name ?? "Uncategorized", top_bucket: topOf(b)?.name ?? "Uncategorized",
      kind: b?.kind ?? (s.cents < 0 ? "spend" : "income"),
      person: members.find((m) => m.user_id === t.by)?.display_name ?? null,
      source: "manual", needs_review: !!t.review, verified: !!t.verified, tags: [], transfer_id: t.transfer_id ?? null,
    };
  }));
}

function balanceHistory(today: Date): Balance[] {
  const rand = rng(7);
  const out: Balance[] = [];
  const level: Record<string, number> = { chq: 240000, joint: 118000, card2: 64000, rewards: 52000, globe: 41000, cash: 9000 };
  for (let back = 13; back >= 0; back--) {
    const date = isoDate(new Date(today.getFullYear(), today.getMonth() - back + (back === 0 ? 0 : 1), back === 0 ? today.getDate() : 0));
    for (const a of accounts) {
      const drift = a.is_debt ? -Math.round(rand() * 9000) : Math.round((rand() - 0.25) * 26000);
      level[a.id] = Math.max(a.is_debt ? 8000 : 2000, level[a.id] + drift);
      out.push({ account_id: a.id, date, balance_cents: level[a.id] });
    }
  }
  return out;
}

export function demoSource(today = new Date()): DashboardSource {
  const txs = generate(today);
  const lines = toLines(txs);
  const rows: TransactionRow[] = txs.slice().reverse().map((t) => ({
    id: t.id, date: t.date, merchant: t.merchant, amount_cents: t.splits.reduce((s, x) => s + x.cents, 0), source: "manual",
    needs_review: !!t.review, verified: !!t.verified, note: null, account_id: t.account, created_by: t.by,
    orig_currency: null, orig_amount: null, splits: t.splits.map((s) => ({ amount_cents: s.cents, bucket_id: s.bucket })),
  }));
  return {
    userId: ME, earliest: txs[0]?.date ?? null, me: members[0], members, accounts, buckets: withFamilyColors(buckets),
    widgets: async (page) => DEMO_WIDGETS.filter((w) => w.page === page).map((w) => ({ ...w, id: `${w.page}-${w.position}` })),
    lines: async (start, end) => lines.filter((l) => (!start || l.date >= start) && l.date < end),
    linesOf: async (ids) => lines.filter((l) => l.bucket_id && ids.includes(l.bucket_id)),
    budgets: async () => budgetRows,
    transactions: async (limit, range) => rows.filter((r) => !range || ((!range.start || r.date >= range.start) && r.date < range.end)).slice(0, limit),
    balances: async () => balanceHistory(today),
    owed: async () => [
      { person: "Jordan", amount_cents: 4250, items: 1, since: isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9)), next_due: null },
      { person: "Priya from work", amount_cents: 1875, items: 2, since: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 18)), next_due: null },
      { person: "Mom", amount_cents: -20000, items: 1, since: isoDate(new Date(today.getFullYear(), today.getMonth() - 2, 3)), next_due: isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    ],
    view: async (name) => ({ rows: [], error: `The demo has no view called “${name}”.` }),
    demo: true,
  };
}
