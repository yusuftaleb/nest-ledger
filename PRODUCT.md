# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The adults of one household, usually two, who share their money. Everyone in the household signs in to the same copy and sees everything, including each other's accounts. They glance at it on a phone between other things, and sit down with it on a laptop to review. Each household runs its own copy; there is no shared service and no audience beyond the household.

## Product Purpose

Nest Ledger is a private money notebook for one household. It holds every transaction from their bank and card accounts, sorts them into buckets, sets budgets and goals against them, and shows where they stand.

Success means:
- Adding a transaction takes seconds.
- They know where they stand at a glance: budgets, what's coming up, and what changed.
- It is calm, not alarming. It notices things and says them plainly.
- It is free to run (Vercel Hobby and Supabase Free) and someone who doesn't program can set it up from written steps.

## Positioning

AI agents do the heavy lifting with the household's own chat accounts, not an AI API. Codex, Claude or ChatGPT read statements and receipts and write rows straight into the household's own database through the Supabase MCP connector, and an agent can write the AI Insights on Home. The app checks every number an agent writes. Because every money concept (buckets, budgets, goals, accounts and even dashboard cards) is a row, an agent can add or change any of them without a code change or a deploy.

## Operating Context

- **Phone:** quick checks and quick adds, installed to the home screen as a PWA.
- **Laptop:** review, analysis and planning.
- **Getting data in:** statements and receipts stay on the household's own computer and are imported by their agent.
- **AI Insights:** the household's agent is sent only bucket-level sums (no merchants, accounts or people).
- **Hosting:** each household's own Supabase project and Vercel app (or their own computer). Nobody else, including the people who make Nest Ledger, can see their data.

## Capabilities and Constraints

- **Agents, not an AI API.** Agents write through the Supabase MCP connector, and the app verifies every number they produce.
- **One household per copy.** Amounts are integer cents in the household's currency; foreign purchases keep their original currency alongside. Only people the owner invites can sign in.
- **Private by construction.** Bank exports and receipts are never committed, uploaded anywhere but the household's own storage, or shown outside the household.
- **Everything is a row.** Cards, buckets, budgets, goals and accounts are data, so every card must work for any data, including none. Don't add enums or check constraints that would block an agent.
- **Undecided, not a constraint:** bank sync is left out for now, but it is not ruled out.
- **Vocabulary:** buckets (nested categories), budgets, goals, owed money and lending, transfers, recurring bills, Matched and Review badges, periods (month, quarter, year, custom), Home, Activity, Analysis and Plan.

## Brand Commitments

- **Name:** Nest Ledger, with its nest logo and favicon.
- **Visual system:** Notion's, recorded in `DESIGN.md`. That means a warm paper canvas, white cards on hairlines, near-black Inter text, and exactly one accent, Notion blue.
- **Voice:** plain and calm. It says what happened in everyday words, without alarm.

## Evidence on Hand

- **Demo data:** a made-up household (`src/lib/demo.ts`) for screenshots and design work at `/demo` in development.
- **Absences:** there are no testimonials, press or user numbers, and none should ever be invented.

## Product Principles

1. **Seconds, not minutes.** The common path (add, check, glance) must feel instant on a phone.
2. **Calm clarity.** Show where things stand and what changed, plainly, without alarm or noise.
3. **Data drives the interface.** Every surface works for whatever rows exist, including none, and nothing about money is hardcoded.
4. **Agents write, the app verifies.** Intelligence comes from the household's own agent accounts, and every number is checked before it is shown.
5. **Private and free.** One household, its own copy, no paid services, and nothing sensitive leaves its control beyond bucket-level sums.
