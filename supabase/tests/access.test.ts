// Who can see and change what, checked on a throwaway Postgres (PGlite) built from supabase/migrations.
// Two households: Home (owner Ana, member Ben) and Away (owner Cy). Nobody may read or write across them,
// a stranger gets nothing, and signed-out visitors get nothing at all. New tables and views are covered
// automatically: every table must have row-level security and every view must run as the person asking.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Just enough of Supabase for the migrations: its roles and auth helpers, reading the signed-in user from settings.
const SUPABASE = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), '')) $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`;

const ANA = "00000000-0000-0000-0000-00000000000a", BEN = "00000000-0000-0000-0000-00000000000b";
const CY = "00000000-0000-0000-0000-00000000000c", DEE = "00000000-0000-0000-0000-00000000000d";
const people: Record<string, string> = { [ANA]: "ana@example.test", [BEN]: "ben@example.test", [CY]: "cy@example.test", [DEE]: "dee@example.test" };

const db = new PGlite();
let home = "", away = "";
const ids: Record<string, string> = {};

type Result = { ok: true; rows: Record<string, unknown>[]; affected: number } | { ok: false; error: string };

/** Runs SQL as a signed-in person (or as a signed-out visitor with `null`), the way the app's API would. */
async function as(user: string | null, sql: string, params: unknown[] = []): Promise<Result> {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)",
    [user ?? "", user ? people[user] : ""]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  try {
    const r = await db.query<Record<string, unknown>>(sql, params);
    return { ok: true, rows: r.rows, affected: r.affectedRows ?? 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await db.exec("reset role");
  }
}

/** Runs SQL as the database owner (an agent connected as admin): no signed-in person. */
async function admin(sql: string, params: unknown[] = []) {
  await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.email', '', false)");
  return (await db.query<Record<string, unknown>>(sql, params)).rows;
}

const one = async (user: string | null, sql: string, params: unknown[] = []) => {
  const r = await as(user, sql, params);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0];
};

before(async () => {
  await db.exec(SUPABASE);
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  await admin(`insert into auth.users values ($1, $2), ($3, $4), ($5, $6), ($7, $8)`, Object.entries(people).flat());

  // Home: Ana sets it up, invites Ben, Ben joins
  home = (await one(ANA, "select bootstrap_member('CAD') as id")).id as string;
  await one(ANA, "select invite_member('ben@example.test')");
  assert.equal((await one(BEN, "select bootstrap_member() as id")).id, home);

  // Away: a second household on the same database can only come from an admin (an agent), never from sign-in
  away = (await admin(`insert into households (name, owner_id) values ('Away', $1) returning id`, [CY]))[0].id as string;
  await admin(`insert into members (user_id, household_id, display_name, email) values ($1, $2, 'Cy', 'cy@example.test')`, [CY, away]);

  // something of every kind in Home, written by Ana through the app's rules
  const pick = async (sql: string) => (await one(ANA, sql)).id as string;
  ids.account = await pick("select id from accounts order by sort limit 1");
  ids.bucket = await pick("select id from buckets where kind = 'spend' order by sort limit 1");
  ids.tx = await pick(`insert into transactions (account_id, merchant, amount_cents) values ('${ids.account}', 'Corner shop', -1450) returning id`);
  await one(ANA, `insert into splits (transaction_id, bucket_id, amount_cents) values ('${ids.tx}', '${ids.bucket}', -1450) returning id`);
  ids.tag = await pick("insert into tags (name) values ('trip') returning id");
  await one(ANA, `insert into transaction_tags (transaction_id, tag_id) values ('${ids.tx}', '${ids.tag}') returning tag_id`);
  await one(ANA, `insert into balances (account_id, balance_cents) values ('${ids.account}', 230000) returning account_id`);
  await one(ANA, `insert into budgets (bucket_id, amount_cents) values ('${ids.bucket}', 40000) returning id`);
  await one(ANA, "insert into owed (person, amount_cents) values ('Jordan', 4000) returning id");
  await one(ANA, "insert into recurring (merchant, amount_cents) values ('Phone plan', -5000) returning id");
  await one(ANA, "insert into saved_views (name, query) values ('Trips', 'q=trip') returning id");
  await one(ANA, "insert into documents (storage_path) values ('receipts/x.jpg') returning id");
  await admin(`insert into ai_insights (household_id, items) values ($1, '{}')`, [home]);
});

const tables = async () => (await admin(`select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`)) as { name: string; rls: boolean }[];
const views = async () => (await admin(`select c.relname as name, coalesce(c.reloptions::text, '') as options from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' order by 1`)) as { name: string; options: string }[];
const withHousehold = async () => (await admin(`select table_name as name from information_schema.columns
  where table_schema = 'public' and column_name = 'household_id' order by 1`)).map((r) => r.name as string);

test("every table has row-level security", async () => {
  const off = (await tables()).filter((t) => !t.rls).map((t) => t.name);
  assert.deepEqual(off, []);
});

test("every view runs as the person asking", async () => {
  const definer = (await views()).filter((v) => !v.options.includes("security_invoker=true")).map((v) => v.name);
  assert.deepEqual(definer, []);
});

test("a signed-out visitor can't read or write anything", async () => {
  for (const { name } of [...(await tables()), ...(await views())]) {
    const r = await as(null, `select count(*)::int as n from ${name}`);
    assert.ok(!r.ok || r.rows[0].n === 0, `anon read ${name}`);
  }
  assert.equal((await as(null, "insert into households (name) values ('x')")).ok, false);
  assert.equal((await as(null, "select bootstrap_member()")).ok, false);
});

test("a signed-out visitor can call no function except asking whether the copy is set up", async () => {
  const callable = (await admin(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map((r) => r.name);
  assert.deepEqual(callable, ["is_set_up"]);
});

test("is_set_up says whether a household exists, and nothing more", async () => {
  assert.equal((await one(null, "select is_set_up() as v")).v, true);
});

test("neither household can see the other's rows, in any table or view", async () => {
  for (const name of await withHousehold()) {
    for (const [user, other] of [[CY, home], [ANA, away], [BEN, away]] as const) {
      const r = await as(user, `select count(*)::int as n from ${name} where household_id = $1`, [other]);
      assert.ok(!r.ok || r.rows[0].n === 0, `${people[user]} read ${name} of the other household`);
    }
  }
  for (const name of ["splits", "transaction_tags"]) assert.equal((await one(CY, `select count(*)::int as n from ${name} where transaction_id = $1`, [ids.tx])).n, 0, name);
  assert.equal((await one(CY, "select count(*)::int as n from balances where account_id = $1", [ids.account])).n, 0);
  assert.equal((await one(CY, "select count(*)::int as n from households where id = $1", [home])).n, 0);
});

test("neither household can change or delete the other's rows", async () => {
  for (const name of [...(await withHousehold()), "households"]) {
    if ((await views()).some((v) => v.name === name)) continue;
    const key = name === "households" ? "id" : "household_id";
    const upd = await as(CY, `update ${name} set ${key} = ${key} where ${key} = $1`, [home]);
    assert.ok(!upd.ok || upd.affected === 0, `update ${name}`);
    const del = await as(CY, `delete from ${name} where ${key} = $1`, [home]);
    assert.ok(!del.ok || del.affected === 0, `delete ${name}`);
  }
  for (const [name, key, id] of [["splits", "transaction_id", ids.tx], ["transaction_tags", "transaction_id", ids.tx], ["balances", "account_id", ids.account]]) {
    const del = await as(CY, `delete from ${name} where ${key} = $1`, [id]);
    assert.ok(!del.ok || del.affected === 0, `delete ${name}`);
  }
  assert.equal((await admin("select count(*)::int as n from transactions where household_id = $1", [home]))[0].n, 1);
});

test("neither household can write rows into the other", async () => {
  const into: [string, string][] = [
    ["accounts", "(household_id, name) values ($1, 'x')"],
    ["buckets", "(household_id, name) values ($1, 'x')"],
    ["transactions", `(household_id, account_id, merchant, amount_cents) values ($1, '${ids.account}', 'x', -1)`],
    ["rules", `(household_id, pattern, bucket_id) values ($1, 'x', '${ids.bucket}')`],
    ["budgets", `(household_id, bucket_id, amount_cents) values ($1, '${ids.bucket}', 1)`],
    ["widgets", "(household_id, type) values ($1, 'stat')"],
    ["settings", "(household_id, key) values ($1, 'x')"],
    ["saved_views", "(household_id, name, query) values ($1, 'x', 'q')"],
    ["owed", "(household_id, person, amount_cents) values ($1, 'x', 1)"],
    ["tags", "(household_id, name) values ($1, 'x')"],
    ["recurring", "(household_id, merchant, amount_cents) values ($1, 'x', 1)"],
    ["documents", "(household_id) values ($1)"],
    ["ai_insights", "(household_id, items) values ($1, '{}')"],
    ["invites", "(household_id, email) values ($1, 'x@example.test')"],
    ["members", `(household_id, user_id, display_name, email) values ($1, '${CY}', 'x', 'x')`],
    ["history", "(household_id, table_name, op, actor) values ($1, 'x', 'x', 'x')"],
  ];
  for (const [name, rest] of into) assert.equal((await as(CY, `insert into ${name} ${rest}`, [home])).ok, false, `insert into ${name}`);
  assert.equal((await as(CY, `insert into splits (transaction_id, amount_cents) values ($1, -1)`, [ids.tx])).ok, false);
  assert.equal((await as(CY, `insert into transaction_tags (transaction_id, tag_id) values ($1, $2)`, [ids.tx, ids.tag])).ok, false);
  assert.equal((await as(CY, `insert into balances (account_id, balance_cents) values ($1, 1)`, [ids.account])).ok, false);
});

test("a transfer can't use the other household's accounts", async () => {
  const mine = (await one(CY, "insert into accounts (name) values ('Cy chequing') returning id")).id;
  assert.equal((await as(CY, "select record_transfer($1, $2, 100, current_date, 'x')", [mine, ids.account])).ok, false);
});

test("only the very first person sets a household up; everyone else needs an invite", async () => {
  const r = await as(DEE, "select bootstrap_member()");
  assert.ok(!r.ok && /not invited/.test(r.error));
  assert.equal((await as(DEE, "select default_household() as h")).ok && (await one(DEE, "select default_household() as h")).h, null);
});

test("only the owner invites, and an invite can't be moved between households", async () => {
  assert.match((await one(ANA, "select invite_member('dee@example.test') as t")).t as string, /^[0-9a-f]{64}$/);
  assert.equal((await as(BEN, "select invite_member('dee@example.test')")).ok, false);
  assert.equal((await as(CY, "select invite_member('dee@example.test')")).ok, false);
  assert.equal((await as(BEN, "insert into invites (email, household_id) values ('eve@example.test', $1)", [home])).ok, false);
  assert.equal((await as(ANA, "select token from invites")).ok, false);
});

test("an invite that ran out doesn't let anyone in", async () => {
  await admin("update invites set expires_at = now() - interval '1 minute' where email = 'dee@example.test'");
  assert.equal((await as(DEE, "select bootstrap_member()")).ok, false);
});

test("members can rename the household but not take it over or promote themselves", async () => {
  assert.equal((await as(BEN, "update households set owner_id = $1 where id = $2", [BEN, home])).ok, false);
  assert.equal((await as(BEN, "update members set role = 'owner' where user_id = $1", [BEN])).ok, false);
  assert.equal((await as(BEN, "update members set household_id = $1 where user_id = $2", [away, BEN])).ok, false);
  assert.equal((await one(BEN, "update households set name = 'Ours' where id = $1 returning name", [home])).name, "Ours");
});

test("history is read-only, and undo is for admins only", async () => {
  assert.ok(((await one(ANA, "select count(*)::int as n from history")).n as number) > 0);
  const del = await as(ANA, "delete from history");
  assert.ok(!del.ok || del.affected === 0);
  assert.equal((await as(ANA, "select undo_change(1)")).ok, false);
});

test("rate-limit tries are out of reach for everyone but the server", async () => {
  for (const user of [null, ANA]) {
    assert.equal((await as(user, "select allow_attempt('k', 1, 60)")).ok, false);
    const r = await as(user, "select count(*)::int as n from attempts");
    assert.ok(!r.ok || r.rows[0].n === 0);
  }
  await db.exec("set role service_role");
  const first = (await db.query<{ v: boolean }>("select allow_attempt('k', 2, 60) as v")).rows[0].v;
  const second = (await db.query<{ v: boolean }>("select allow_attempt('k', 2, 60) as v")).rows[0].v;
  const third = (await db.query<{ v: boolean }>("select allow_attempt('k', 2, 60) as v")).rows[0].v;
  await db.exec("reset role");
  assert.deepEqual([first, second, third], [true, true, false]);
});
