# Set up your own Nest Ledger

About 20 minutes, no programming, and free. You'll end up with your household's own copy: your own database, your own website, and nobody else (including the people who make Nest Ledger) can see your money.

Rather have an AI agent do it? Open this folder in Claude Code, Codex or Gemini and say **"set up Nest Ledger for me"**. It follows `AGENTS.md` and only stops when you need to sign in somewhere.

## What you need

- An email address.
- Free accounts at three places. You'll make each one as you go:
  - **GitHub** keeps your copy of the code.
  - **Vercel** runs the website.
  - **Supabase** holds the database. You'll create it from inside Vercel.

## 1. Copy Nest Ledger to your GitHub

1. Sign in to [github.com](https://github.com), or make an account.
2. Open the Nest Ledger repository and click **Fork** (top right), then **Create fork**.

**It worked if** you see a repository called `nest-ledger` under your own name.

## 2. Put it online with Vercel

1. Go to [vercel.com](https://vercel.com) and choose **Continue with GitHub**.
2. Click **Add New… → Project**, find your `nest-ledger` fork, and click **Import**.
3. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SETUP_PASSWORD` | Any password you make up. You'll type it once, to claim your copy. |
   | `NEXT_PUBLIC_CURRENCY` | Your currency, such as `USD`, `CAD`, `EUR` or `GBP`. |
   | `NEXT_PUBLIC_LOCALE` | How you write numbers and dates, such as `en-US`, `en-CA`, `en-GB` or `fr-FR`. |
   | `NEXT_PUBLIC_WEEK_START` | `1` if your week starts on Monday, `0` for Sunday. |

   The last three are optional. Without them you get Canadian dollars and weeks that start on Monday.
4. Click **Deploy**.

**It worked if** Vercel shows "Congratulations" and a link to your site. The site isn't ready yet: it needs a database.

## 3. Add the database

1. In your Vercel project, open the **Storage** tab.
2. Choose **Create Database**, then **Supabase**, and follow the steps. Pick the region closest to you. When it asks which environments to connect, leave all of them ticked.

   Vercel creates your Supabase account and project, and fills in the settings the site needs to reach it. You don't copy any keys yourself.
3. Open the **Deployments** tab, click the **⋯** next to the top deployment, and choose **Redeploy**.

**It worked if** the new deployment's build log ends with a line that starts `migrate:` and says the database is up to date. That's your tables being created.

## 4. Claim your copy

1. Open your site. It goes straight to the setup page.
2. Type the `SETUP_PASSWORD` from step 2, your name, a name for your household, your email and a new password.
3. Click **Set up Nest Ledger**.

**It worked if** you land on Home. You are the household's owner. The setup page closes for good: nobody else can claim your copy.

If the setup page says settings are missing, it lists them by name. Add them under Vercel → Settings → Environment Variables and redeploy.

## 5. Lock the door

Your copy already refuses anyone you didn't invite. This step also stops strangers from creating empty accounts in your database:

1. In Vercel → **Storage**, open your Supabase database and choose **Open in Supabase**.
2. Go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. Save.

Your own sign-in and your invites keep working.

## 6. Invite your partner

1. In your site, open **Settings → Household → Invite your partner**.
2. Type their email and click **Make a join link**.
3. Send them the link however you like: a message, a chat app, an email.

They open it, choose a password, and they're in. The link works once, for 7 days. If it runs out, click **New link** beside their name.

## 7. Put it on your phone

Open your site on your phone, then:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Add to Home screen**.

## Getting updates

When a new version of Nest Ledger comes out, your fork on GitHub says "This branch is … commits behind". Click **Sync fork → Update branch**. Vercel puts the new version online by itself, and updates your database on the way.

## If something goes wrong

- **Forgot your password:** if your copy can send email (below), use "Email me a code instead" on the sign-in page, then set a new password in Settings → You. Otherwise an AI agent connected to your database can set a new one for you.
- **The site says it can't reach the database after a quiet week:** free Supabase projects pause after a week without use. Open Supabase and click **Restore project**.
- **Emailed sign-in codes:** optional. Add your own email sender in Supabase → Authentication → **SMTP Settings** (any provider with SMTP works, many have a free plan), then add `NEXT_PUBLIC_EMAIL_CODES` = `1` in Vercel and redeploy. The sign-in page then offers "Email me a code instead".

## Connect your AI agent (optional)

Your agent (Codex, Claude, ChatGPT or Gemini) can read your statements and receipts and add the transactions for you, and write AI Insights. Connect it to your own database with Supabase's MCP connector: see [supabase.com/docs/guides/getting-started/mcp](https://supabase.com/docs/guides/getting-started/mcp). Then point it at `HANDOFF.md`, which explains how your data is laid out and what it can do.

An agent connected this way acts as the database's admin. That's fine for your own database; just don't give that connection to anyone else.
