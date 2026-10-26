// Brings the database up to date: applies supabase/migrations/*.sql that it hasn't seen yet, each in its own
// transaction, and records them in Supabase's own table (supabase_migrations.schema_migrations), so
// `supabase db push` and this script always agree on what has run.
//
// `npm run build` runs it after `next build` succeeds, so a failed build never touches the database, and only
// on production deploys (preview deploys skip it). Run it by hand with `npm run migrate`. It needs
// POSTGRES_URL_NON_POOLING (or POSTGRES_URL), which Vercel's Supabase integration fills in; without one it
// does nothing, so a copy that updates its database another way (the Supabase CLI) is unaffected.
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log("migrate: skipped on a preview deploy");
  process.exit(0);
}
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.log("migrate: skipped, no POSTGRES_URL_NON_POOLING set");
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
  const done = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version));
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    const [version, ...name] = file.replace(/\.sql$/, "").split("_");
    if (done.has(version)) continue;
    const body = readFileSync(`supabase/migrations/${file}`, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, statements, name) values (${version}, ${[body]}, ${name.join("_")})`;
    });
    console.log(`migrate: applied ${file}`);
    applied++;
  }
  console.log(applied ? `migrate: ${applied} applied, database up to date` : "migrate: database already up to date");
} catch (e) {
  console.error(`migrate: stopped, nothing after the failing file was applied: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
