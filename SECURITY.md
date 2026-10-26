# Security

## Reporting a problem

Please report security problems privately: on GitHub, open **Security → Report a vulnerability** on this repository. Don't open a public issue, and never include real financial data or anyone's keys in a report.

You'll get a reply within a week. Fixes ship as a new release; every copy's Settings → About then shows that an update is out.

## What is in place

- **Access:** row-level security on every table; every view runs as the person asking; signed-out visitors can call one function (`is_set_up`, yes or no). `supabase/tests/access.test.ts` checks this for two households on every change.
- **Sign-in:** only the first person (with the setup password) creates a household; everyone else needs a join link from its owner, good once for 7 days. Sign-in, emailed codes and the setup password are rate-limited.
- **The service role key** stays on the server, in `src/lib/supabase/admin.ts`, used only for `/setup` and join links.
- **Browser:** a per-page nonce content security policy, no framing, `nosniff`, same-origin referrer, HSTS.
- **Supply chain:** a lockfile, Dependabot, and CI that typechecks, lints, tests, builds and scans for leaked secrets.

## Running your own copy safely

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in your host's settings or `.env.local`; never in chat, commits or screenshots.
- Turn off new sign-ups in Supabase (Authentication → Sign In / Providers), as `docs/SETUP.md` says.
- An AI agent connected through Supabase's MCP connector is an admin of your database. Connect only agents you trust, with your own account.
- Update when Settings → About says a new version is out.
