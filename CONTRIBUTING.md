# Contributing

Thanks for helping. Nest Ledger is a calm, private money notebook that each household runs for itself; changes should keep it that way.

## Before you start

- Read `HANDOFF.md` (how it works), `PRODUCT.md` (who it's for and its principles) and `DESIGN.md` (the design system).
- For anything bigger than a fix, open an issue first so we can agree on the shape.
- Never put real financial data, statements, receipts or keys in issues, pull requests, tests or screenshots. Use the made-up demo household (`/demo` in development).

## Working on it

```bash
cp .env.local.example .env.local   # point it at your own Supabase project
npm install
npm run dev
```

Before you open a pull request, all of these must pass (CI runs them too):

```bash
npx next typegen && npx tsc --noEmit
npm run lint
npm test          # unit tests and the access-rule tests
npm run build
```

## Rules that keep copies safe

- **Migrations only add.** Add a new file in `supabase/migrations/`; never edit one that has been released. Households update on their own schedule.
- **Every new table has row-level security** and every new view runs as the asker; the access tests fail otherwise. New functions aren't callable by signed-out visitors unless you grant it on purpose.
- **No enums or check constraints** that would block an agent: free text plus a `comment on` describing the suggested values.
- **Nothing about money is hardcoded.** Currency, locale and week start come from `src/lib/format.ts`; all money goes through `formatCents`.
- **No analytics, outside scripts or new outside calls.** If something must leave a copy, it goes in `PRIVACY.md` with a way to turn it off.
- **Plain, calm words** in the interface, as `PRODUCT.md` describes.

## Releases

Bump `version` in `package.json`, tag the same number (`v0.2.0`), and publish a GitHub release with plain-English notes. Copies see it in Settings → About.

By contributing you agree that your work is shared under the [AGPL-3.0](LICENSE).
