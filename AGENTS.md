<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Nest Ledger

Read `HANDOFF.md` first: what the app is, how the data is laid out, and the rules. `PRODUCT.md` says who it's for; `DESIGN.md` is the design system.

## Set up a new copy

When someone asks you to set up Nest Ledger, do this. People without a programming background use it, so explain each step in a sentence, do everything you can yourself, and stop to ask only when they must sign in in a browser or choose something. `docs/SETUP.md` is the same setup by hand; offer it if anything below fails.

1. **Ask** for: their currency (`USD`, `CAD`, `EUR`…), how they write dates (`en-US`, `en-CA`, `en-GB`…), whether the week starts on Monday or Sunday, and whether they want it online (Vercel) or only on this computer.
2. **Fork and install.** In this folder: `gh repo fork --remote` (signs them in to GitHub if needed; keeps this repo as `upstream` for updates), then `npm install`.
3. **Database.** `npx supabase login` (they finish it in the browser). Then:
   - `npx supabase orgs list`, and pick their organisation.
   - `npx supabase projects create nest-ledger --org-id <org> --region <closest region> --db-password <generate a strong one>`. Keep the password only in `.env.local`, never in chat.
   - `npx supabase link --project-ref <ref>`, then `npx supabase db push`. This creates every table.
   - `npx supabase projects api-keys --project-ref <ref>` gives the anon (or publishable) key and the service role key. Don't print them; write them straight into `.env.local`.
4. **Settings.** `cp .env.local.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `SETUP_PASSWORD` (ask them to choose one, or generate one and tell them), and the currency, locale and week start from step 1.
5. **Lock the door.** Turn off new sign-ups for the project: Supabase dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" off. With a Supabase access token you can do it directly: `PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` with `{"disable_signup": true}`. Invites and the owner's own sign-in keep working.
6. **Run it.**
   - **This computer only:** `npm run build && npm start`, then open http://localhost:3000.
   - **Online:** `npx vercel login`, `npx vercel link`, then `npx vercel env add <NAME> production` for each line of `.env.local` (read the values from the file; never echo them), then `npx vercel deploy --prod`. Add `POSTGRES_URL_NON_POOLING` too (the session pooler connection string from the Supabase dashboard → Connect) if they want each deploy to update the database by itself; otherwise run `npx supabase db push` after each update.
7. **Claim it.** Send them to `<site>/setup`. They type the setup password, their name, household name, email and a password, and become the household's owner. Then show them Settings → Household → Invite your partner, which makes a join link to send.
8. **Optional:** connect their agent to the database with Supabase's MCP connector (supabase.com/docs/guides/getting-started/mcp), and point it at `HANDOFF.md`.

Never copy anything from another household's copy, never commit `.env.local`, and never paste keys into chat.

## Update a copy

`git pull upstream main` (or the **Sync fork** button on GitHub), `npm install`, then `npx supabase db push` (a Vercel deploy with `POSTGRES_URL_NON_POOLING` set does that by itself) and redeploy. Migrations only ever add; never edit one that has been released.

## Forgotten password

With the service role key, set a new one: `supabase.auth.admin.updateUserById(<user id>, { password })` (find the id in `auth.users` by email). Tell the person the new password privately and ask them to change it in Settings → You.
