# Handoff

Read this first if you are picking up the project, whether you are a person or an agent (Claude Code, Codex, ChatGPT, Gemini).

## What this is

Nest Ledger is a shared money tracker for one household. Each household runs its own copy: its own Supabase project and its own Vercel app, both on free plans (see `docs/SETUP.md`). Everyone in the household signs in and sees everything. Amounts are in the household's currency (`NEXT_PUBLIC_CURRENCY`).

- **App:** Next.js 16 (App Router, `src/`), React 19, Tailwind v4 and Lucide icons. It is hosted on Vercel's free plan.
- **Data:** the household's own Supabase project: Postgres, sign-in and storage. The schema is `supabase/migrations/`, oldest first. Every production deploy applies new migrations (`scripts/migrate.mjs`, after `next build`); `npx supabase db push` does the same from a computer.
- **Sign-in:** email and password. The first person to open `/setup` (with the `SETUP_PASSWORD` server setting) owns the household; the owner invites others with join links. Emailed codes are optional (`NEXT_PUBLIC_EMAIL_CODES=1`, with the household's own SMTP sender).
- **AI:** the app has no AI API. Codex (or Claude or Gemini CLI) connect straight to the database through the Supabase MCP connector. They read receipts and statements, write rows, and can even change the dashboard.
- **AI Insights:** `npm run insights:ai` (`scripts/ai-insights.mts`) has Codex write Home's AI Insights from bucket-level sums; on a Mac, launchd can run it daily (`scripts/ai-insights.plist`). Money that arrives early for next month, such as rent sent on the 30th or a stipend paid ahead, counts in the month it pays for when an active `recurring` row has `attrs.counts_for = "next_month"` (see that table's comment).
- **Product:** `PRODUCT.md` says who it's for, what success means, the binding constraints and the product principles. Read it before design work.
- **Design:** Notion style with an Apple-style segmented Month / Quarter / Year switch. See `docs/design-system-notion.html`.

Next 16 is different from older versions: `src/proxy.ts` replaces middleware, and `params` and `searchParams` are promises. Read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`).

## The one idea: everything is a row

Nothing about money is hardcoded in the app. Buckets, budgets, goals, accounts and even the dashboard cards are rows. To add something new, add a row. You never need a code change or a deploy.

Every table and column carries a `comment on` description. **Agents: read the comments before writing.** For example:

```sql
select table_name, obj_description(('public.'||table_name)::regclass) from information_schema.tables where table_schema='public';
```

### Conventions

| Thing | Rule |
|---|---|
| Money | Integer cents, in the household's currency. Money out is negative and money in is positive (`-1450` = 14.50 spent). |
| Kinds, sources, periods | Free text, not enums. The suggested values are in the comments, but any new word works. |
| `attrs jsonb` | Every main table has one. Put anything extra here instead of asking for a new column. |
| `household_id` | Defaults to `default_household()`, so agents can leave it out while there is one household. |
| Undo | Every insert, update and delete is saved in `history`. `select undo_change(<history id>);` reverses one change. |
| Archive, don't delete | `archived = true` hides an account or bucket but keeps old transactions readable. |

### Main tables

- `accounts`: name, institution, kind, currency, owner_id, is_debt, archived, sort, attrs.
- `buckets`: name (unique), parent_id (for sub-buckets), kind (`spend` · `income` · `transfer` · `saving` · `goal` · anything else), icon (a Lucide name such as `baby`), color (`1`–`8` or any CSS color), target_cents, target_date, attrs.
- `budgets`: bucket_id, amount_cents, period (`week` · `month` · `quarter` · `year`), starts, ends. A new row with a later `starts` replaces the old amount from that date, so history stays correct.
- `transactions` plus `splits`: one transaction (date, merchant, account, total) has one or more splits, each with a bucket and amount. A Superstore receipt can be split into Groceries, Baby and Household. `needs_review` flags rows for a person to check.
- **Transfers** between our own accounts: two transactions (money out on one account, money in on the other) sharing a `transfer_id`, each in a bucket of kind `transfer`. `select record_transfer(from_account, to_account, amount_cents, date, note)` writes both at once. The `transfers` view shows one row per move. Credit card payments are transfers too.
- `owed`: money other people owe us (positive `amount_cents`) or we owe them (negative), one row per IOU with `person`, `reason`, `date`, optional `due_date`, and `settled_on` when paid back. Never delete; settle. The `owed_by_person` view shows what is open per person. When we pay for someone, their share of the purchase goes in a bucket of kind `lent` ("Lent to others") so it isn't our spending.
- `rules`: pattern → bucket_id. These are learned when someone re-buckets a merchant.
- `balances`: account_id, date, balance_cents. Net worth uses the latest row per account; debt accounts store the amount owed as a positive number.
- `widgets`: page, position, type, title, spec, enabled. These are the dashboard cards.
- `documents`, `recurring`, `tags`, `transaction_tags`, `settings`, `invites`, `members`, `households`.
- Views: `lines` (one row per split, joined with everything; this is what the dashboard reads), `bucket_tree` and `monthly`.

## What agents can do (example requests)

- **"Add a bucket for daycare under Baby with a $400 monthly budget":** insert into `buckets` (with parent_id set to Baby's id), then insert into `budgets`.
- **"Here's my Superstore receipt":** insert a transaction (`source = 'receipt'`) with one split per bucket. Share the tax across the splits so they add up to the total.
- **"Here's the bank statement":** insert one transaction per line (`source = 'statement'`). Skip lines that already exist (same account, amount, and a date within 3 days); mark those matches `verified = true` instead. Set `needs_review = true` when unsure.
- **"Our savings account is at $3,200":** insert into `balances`.
- **"Moved $200 from chequing to savings":** `select record_transfer(<chequing id>, <savings id>, 20000, '2026-10-10');`
- **"Jordan owes us $40 for dinner":** insert into `owed` (`person = 'Jordan'`, `amount_cents = 4000`, `reason = 'Dinner'`). When they pay it back, set `settled_on`.
- **"The credit card charges 21.99%, minimum $10":** update `accounts.attrs` with `{"apr": 21.99, "min_payment_cents": 1000}`.
- **"Save $2,000 for a car by June":** add a bucket with kind `goal`, `target_cents`, `target_date`. Progress is `attrs.saved_cents` if set, otherwise money moved into that bucket.
- **"Show eating out by month on the plan page":** insert a widget.
- **"Save a view of baby costs this year":** insert into `saved_views` (`name = 'Baby costs this year'`, `query = 'q=baby+this+year&g=bucket'`).

### Widgets

Rows are drawn in `position` order on their `page`. The pages are `home` (a glance at this month), `plan` (goals, budgets, net worth, the forecast, debts, money owed) and `analysis` (the long view and comparisons, under the explorer). A new page name needs a route in the app.

| type | what it shows | spec keys |
|---|---|---|
| `summary` | what was kept, in/out vs last period, budgets left, review link | `period` |
| `insights` | short sentences (pace, biggest change, budget at risk, bills still to come, weekends, subscriptions…) | none |
| `ai` | "AI Insights": Codex's latest summary and notes from `ai_insights`, stamped with when they were written; hidden when over two days old | none |
| `outlook` | the long view over 12 full months: typical month, how long savings last, rising costs, income mix, best month | none |
| `pace` | running total this month vs last month, with the budget line | none |
| `stat` | one number, with last period at the same point | `measure`, `period`, `filter` |
| `bars` | horizontal bars with shares | `measure`, `group_by`, `top`, `period`, `filter` |
| `compare` | which buckets moved vs the same days last period | `top`, `period`, `filter` |
| `share` | one part-of-the-whole strip (`measure: income` shows where money comes from) | `measure`, `period`, `filter` |
| `trend` | one column per month, with the average | `measure`, `months`, `filter` |
| `cashflow` | money in vs out per month, with net | `months`, `filter` |
| `savings_rate` | share of income kept each month, below zero when spending went past income | `months`, `filter` |
| `matrix` | top buckets × months heatmap, each row shaded against its own busiest month | `months`, `top`, `filter` |
| `calendar` | this month day by day | none |
| `weekday` | average per weekday, last 12 weeks | none |
| `bills` | charges that come back every month (3 of the last 4, steady amount, about the same day), paid or still to come | none |
| `upcoming` | the rest of this month: month-end estimate, then each regular bill not yet paid | none |
| `forecast` | month-end estimate: everyday accounts today + regular income to come − bills to come − usual daily spending | none |
| `debts` | debt-free date (avalanche or snowball); needs `accounts.attrs.apr` (percent) and `attrs.min_payment_cents` | `method`, `extra` (cents a month) |
| `owed` | open IOUs per person: owed to us, and what we owe | none |
| `transfers` | moves between our own accounts in the period | `top`, `period` |
| `merchants` | top places: visits, average, total | `top`, `period`, `filter` |
| `budgets` | budget progress, most used first | `period` |
| `goals` | goal progress and monthly amount needed | none |
| `net_worth` | assets minus debts, 12-month history | none |
| `recent`, `review` | transaction lists | `limit` |
| `view` | any database view as a table | `view`, `limit` |

- Every card also takes `span`: `full`, `wide`, `half` or `third` (desktop width; phones stack). On a wide screen a row is 6 columns (full 6, wide 4, half 3, third 2). Keep the cards in one row at similar heights: wide + third, half + half, or three thirds.
An unknown type renders a card listing the known types, so nothing breaks.

## Code map

- `src/lib/dashboard.ts` contains the pure maths: periods, measures, filters, grouping and budget scaling. It is tested in `dashboard.test.ts`.
- `src/components/widgets.tsx` holds the `WidgetBoard` and one renderer per widget type; `src/components/charts.tsx` holds the chart pieces.
- `src/lib/insights.ts` has the analysis behind the newer cards (comparisons, pace, calendar, merchants, regular bills, savings rate, the bucket × month grid, and the Home and Plan insight sentences). It is tested in `insights.test.ts`.
- `src/lib/dashboard-source.ts` is how the dashboard reads data. `src/lib/demo.ts` is a made-up household for the dev-only preview at http://localhost:3000/demo, which is handy for screenshots and design work.
- `DESIGN.md` is the design system (tokens, layout, chart rules).
- `src/lib/search.ts` is the smart search used by Activity and Analysis: it turns phrases like "tims over $10 last month" or "baby 2025 by Sam" into filters (dates, amounts, buckets, accounts, people, kinds, flags; leftover words search merchants and notes; quotes force text). "every october", "octobers", "october over the years" or "may each year" keep one month of the year in every year (`monthOfYear`, a `month` chip); "average", "avg", "monthly" or "per month" ask for the typical month (`average`, picks a chart, filters nothing). Tested in `search.test.ts`.
- Analysis URL: `q` (filters, including dates; none = this month, or all time when `q` says "every <month>" or "average"), `vs` (none by default | prev | year | years | a period's start date), `view` (breakdown | flow | mix | time | running | heatmap | years; with "every <month>" or "average" the default is years), `g`, `m`, `s`, `dir`.
- The explorer card (`src/components/explorer.tsx`): the filters and "compared with" change the whole page; the card's tabs and "Show … by …" change only the card. A mark in a chart opens a sheet (`GroupSheet` for a group, `SlotSheet` for a day, year or flow node), and only "Show only X" in a sheet filters the page. The flow and waterfall come from `flowOf`, the Pace band from `usualBand`, and the Lighter / About usual / Heavier badge from `weightOf` (spending so far against the average of the last 6 months by the same day, ±10%), all in `src/lib/explore.ts`.
- Year by year (`yearByYear` in `src/lib/explore.ts`): one column per year, that month's total ("every October") or each year's average month, with the usual as a dashed line. Only months the records wholly cover count (from the first whole month on record). The running month says "so far", gets a projection, and is left out of the usual; past years carry a tick where they stood by today's date (`upToDay`), and a covered month with nothing in it counts as $0. Every chart and card counts lines through the household's month rules (`countedLines` in `src/lib/month-rules.ts`, rules from `source.monthRules()`): a moved line is dated the 1st of the month it pays for and keeps the day it landed in `paid_on` (shown in lists). Analysis does this for the explorer and Patterns, and `WidgetBoard` does it for every card on Home, Plan and Analysis. Balances always use the real dates. A month in Patterns' "Months that cost more" fills the explorer with "every <month>" (`season-link.tsx`, an `nl-explore` window event). Filters and `vs` reload the page (patterns follow them); the rest is instant in the browser.
- **One comparison per page.** "The period before" for dates that start on the 1st steps back by whole months to the same day (October so far against September's first 25 days; the last 12 months against the 12 before them up to the same date); other stretches step back by their own length. Analysis passes its comparison to its Insights (`Range.vs`), so the answer sentence and every insight compare with the same days. Outlook sentences cover the 12 finished months and name them ("From Oct 2025 to Sep 2026 …").
- `src/lib/explore.ts` is the Analysis maths: the window a view covers, the comparison window, and grouping by any dimension. `src/components/explorer.tsx` runs it in the browser, so filters, grouping and sorting are instant; only a change of dates asks the server.
- **Today** is the viewer's own date: `src/lib/today.ts` reads the `tz` cookie that `<TimeZoneSync>` sets from the browser (Pacific until it has). The server runs on UTC, so never use `new Date()` for "today" on the server.
- **Balances now** = each account's latest `balances` row plus every transaction dated after it (`currentBalances` in `insights.ts`). The `balances` card, the Home summary, net worth, goals and the forecast all use it.
- **Goals** are buckets of kind `goal` with `target_cents`, optional `target_date`, and optional `attrs.account_id`: when set, progress is that account's balance; otherwise money moved into the goal (or `attrs.saved_cents`).
- **Merchant names** are tidied for display only (`src/lib/merchant.ts`): "COSTCO WHOLESALE W1578 VANCOUVER BC" shows as "Costco Wholesale". The database keeps the statement text.
- **Invites** are join links: `invite_member` (owner only) records the email and returns a secret token for `/join/<token>`, good once, for 7 days. Whoever opens it picks a password for that email. No email is sent, because Supabase's built-in sender only reaches the project's own team.
- **The service role key** is used only in `src/lib/supabase/admin.ts` (server-only): to create the owner's account on `/setup` and an invited person's account from a join link.
- **Formatting:** `src/lib/format.ts` holds the currency, locale and first day of the week (`NEXT_PUBLIC_CURRENCY`, `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_WEEK_START`); all money goes through `formatCents` / `formatCompact` in `money.ts`.
- `saved_views` holds named Analysis views (`name`, `query` = the URL parameters), shared by the household.
- `src/lib/quick-add.ts` parses `"14.50 tims"` into an amount, merchant, account and bucket. It is tested.
- `src/lib/actions.ts` contains the server actions: transactions, rules, accounts, buckets and invites.
- `src/lib/household.ts` loads members, accounts, buckets and rules once per request.
- `src/app/(app)/` contains the screens: Home, Add, Transactions, Plan and Settings.

Checks: `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test` (unit tests and `supabase/tests/access.test.ts`, the access rules on a throwaway Postgres) and `npm run build`. CI runs them all, plus a secret scan.

**Releases:** bump `version` in `package.json`, then tag the same number (`v0.2.0`) and publish a GitHub release with plain-English notes. Each copy's Settings → About compares its version with the latest release (`src/lib/version.ts`) and says how to update: Sync fork on GitHub. Migrations in a release only ever add; never edit one that has shipped.

## Rules for whoever works on this

- Don't commit bank exports or receipts. Keep them in `private/` (statements in `private/statements/`, receipts in `private/receipts/`); `private/`, `samples/` and `*.csv` are git-ignored.
- Keys go in `.env.local` or the host's settings only, never in chat, commits or logs.
- The app logs nothing about money: no `console.log` of rows, amounts, merchants or request bodies, on the server or in the browser. Errors say what failed, not what was in it.
- Don't add enums or check constraints that would block an agent. Use free text plus comments.
- An agent connected through the Supabase MCP connector acts as an admin and skips row-level security; that is the household's choice for its own database. The app itself always uses row-level security.
- A copy may keep its own notes in `instance/` (not part of Nest Ledger itself).
