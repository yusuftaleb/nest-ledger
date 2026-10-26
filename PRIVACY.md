# Privacy

Nest Ledger is software you run yourself. There is no Nest Ledger service: the people who make it never receive, store or see your data, and couldn't if they wanted to.

## Where your data lives

Everything (transactions, balances, budgets, notes, who is in the household) is in **your own Supabase project**, and the website runs in **your own Vercel project** (or on your own computer). Supabase encrypts the database at rest and every connection uses TLS.

Only people you invite can sign in, and row-level security in the database limits every read and write to your household.

## What leaves your copy, and when

| What | Where it goes | When | How to turn it off |
|---|---|---|---|
| A request for the latest release number | GitHub's public API | At most every 6 hours, from your server, when someone opens Settings | `NEST_LEDGER_UPDATE_CHECK=0` |
| Bucket names and bucket-level sums (no merchants, accounts or people) | The AI provider your agent uses (for example OpenAI, through Codex) | Only if you run `scripts/ai-insights.mts` | Don't run it |
| Whatever you ask your own AI agent to read or write | That agent's provider | Only when you connect an agent to your database and use it | Don't connect one |

Nothing else. The app has no analytics, tracking pixels, ads or outside scripts; its font is served from your own site; its content security policy stops the browser from sending data anywhere but your site.

## What the app itself never does

- Log amounts, merchants, notes or request bodies.
- Ask for account or card numbers. Accounts have names you choose, such as "Everyday chequing".
- Send email, unless you add your own email sender for sign-in codes.

## Leaving

Your data is yours: it is a Postgres database you own. Export it from Supabase at any time, or delete the project to delete everything.

Nest Ledger is a notebook, not financial advice.
