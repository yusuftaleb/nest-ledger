-- Nest Ledger's database, from scratch: every table, view, function, row-level security policy, grant and
-- description. A new copy starts here; later migrations build on it and only ever add.
-- Each table and column has a description (comment on): agents read those before writing.
-- Written by pg_dump from the schema the app's development history built, then checked to be identical.

set check_function_bodies = false;

--
--

--
-- Name: bootstrap_member(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_member(home_currency text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid  uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  cur  text := upper(coalesce(nullif(trim(home_currency), ''), 'CAD'));
  hh   uuid;
  r    record;
begin
  if uid is null then raise exception 'not signed in'; end if;

  select household_id into hh from members where user_id = uid;
  if hh is not null then return hh; end if;

  select household_id into hh from invites where email = mail and (expires_at is null or expires_at > now());
  if hh is not null then
    insert into members (user_id, household_id, display_name, email)
      values (uid, hh, initcap(split_part(mail, '@', 1)), mail);
    delete from invites where email = mail;
    return hh;
  end if;

  -- only the very first person gets here; first_household_only() refuses anyone else
  insert into households default values returning id into hh;
  insert into members (user_id, household_id, display_name, email)
    values (uid, hh, initcap(split_part(mail, '@', 1)), mail);

  insert into accounts (household_id, name, institution, kind, currency, is_debt, sort) values
    (hh, 'Chequing',    null, 'chequing',    cur, false, 1),
    (hh, 'Savings',     null, 'savings',     cur, false, 2),
    (hh, 'Credit card', null, 'credit_card', cur, true,  3),
    (hh, 'Cash',        null, 'cash',        cur, false, 4);

  insert into buckets (household_id, name, kind, icon, color, sort) values
    (hh, 'Groceries',              'spend',    'shopping-cart',    '1', 1),
    (hh, 'Home',                   'spend',    'house',            '3', 2),
    (hh, 'Phone & internet',       'spend',    'wifi',             '3', 3),
    (hh, 'Transport',              'spend',    'bus',              '4', 4),
    (hh, 'Eating out',             'spend',    'utensils',         '5', 5),
    (hh, 'Health & personal care', 'spend',    'heart-pulse',      '6', 6),
    (hh, 'Household supplies',     'spend',    'spray-can',        '8', 7),
    (hh, 'Clothing',               'spend',    'shirt',            '6', 8),
    (hh, 'Subscriptions',          'spend',    'repeat',           '4', 9),
    (hh, 'Entertainment',          'spend',    'popcorn',          '5', 10),
    (hh, 'Gifts',                  'spend',    'gift',             '6', 11),
    (hh, 'Education',              'spend',    'graduation-cap',   '7', 12),
    (hh, 'Fees & interest',        'spend',    'receipt',          '8', 13),
    (hh, 'Other',                  'spend',    'circle-ellipsis',  '8', 14),
    (hh, 'Pay',                    'income',   'banknote',         '1', 20),
    (hh, 'Benefits & refunds',     'income',   'hand-coins',       '3', 21),
    (hh, 'Other income',           'income',   'circle-ellipsis',  '8', 22),
    (hh, 'Credit card payment',    'transfer', 'credit-card',      '8', 30),
    (hh, 'Between accounts',       'transfer', 'arrow-left-right', '8', 31),
    (hh, 'Lent to others',         'lent',     'hand-coins',       '8', 32),
    (hh, 'Emergency fund',         'goal',     'piggy-bank',       '7', 40);

  -- Home has its own pieces, to show nesting; spending on them rolls up into Home
  insert into buckets (household_id, name, parent_id, kind, icon, color, sort)
    select hh, x.name, b.id, 'spend', x.icon, '3', x.sort
    from buckets b, (values ('Rent or mortgage', 'key-round', 1), ('Utilities', 'plug', 2)) x(name, icon, sort)
    where b.household_id = hh and b.name = 'Home';
  update buckets set target_cents = 100000 where household_id = hh and name = 'Emergency fund';

  -- starter rules for merchants found almost everywhere; every correction adds more
  for r in
    select * from (values
      ('costco', 'Groceries'), ('walmart', 'Groceries'), ('aldi', 'Groceries'), ('lidl', 'Groceries'),
      ('starbucks', 'Eating out'), ('mcdonald', 'Eating out'), ('subway', 'Eating out'), ('pizza', 'Eating out'),
      ('uber eats', 'Eating out'), ('doordash', 'Eating out'), ('kfc', 'Eating out'), ('burger king', 'Eating out'),
      ('uber', 'Transport'), ('lyft', 'Transport'), ('shell', 'Transport'), ('esso', 'Transport'), ('bp ', 'Transport'),
      ('netflix', 'Subscriptions'), ('spotify', 'Subscriptions'), ('disney', 'Subscriptions'), ('apple.com', 'Subscriptions'),
      ('amazon prime', 'Subscriptions'), ('youtube', 'Subscriptions'), ('google storage', 'Subscriptions'),
      ('pharmacy', 'Health & personal care'), ('ikea', 'Household supplies'),
      ('rent', 'Rent or mortgage'), ('mortgage', 'Rent or mortgage'), ('electric', 'Utilities'), ('hydro', 'Utilities'),
      ('gas bill', 'Utilities'), ('water', 'Utilities'),
      ('interest charge', 'Fees & interest'), ('annual fee', 'Fees & interest'),
      ('payroll', 'Pay'), ('salary', 'Pay'),
      ('payment - thank you', 'Credit card payment'), ('payment thank you', 'Credit card payment')
    ) as t(pattern, bucket)
  loop
    insert into rules (household_id, pattern, bucket_id)
      select hh, r.pattern, b.id from buckets b where b.household_id = hh and b.name = r.bucket;
  end loop;

  perform default_widgets(hh);

  insert into settings (household_id, key, value) values (hh, 'currency', to_jsonb(cur));

  return hh;
end;
$$;

--
-- Name: FUNCTION bootstrap_member(home_currency text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.bootstrap_member(home_currency text) IS 'Called on every sign-in. Returns the person''s household: joins an invited person to the household that invited them, sets up a new household (in home_currency) for the very first person, and refuses everyone else.';

--
-- Name: default_household(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_household() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select household_id from members where user_id = auth.uid()),
    (select id from households where auth.uid() is null and (select count(*) from households) = 1)
  )
$$;

--
-- Name: default_widgets(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_widgets(hh uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  insert into widgets (household_id, page, position, type, title, spec) values
    (hh, 'home', 10, 'summary', null, '{"span": "full"}'),
    (hh, 'home', 15, 'ai', 'AI Insights', '{"span": "full"}'),
    (hh, 'home', 20, 'balances', 'Balances', '{"span": "half"}'),
    (hh, 'home', 30, 'budgets', 'Budgets', '{"limit": 4, "span": "half"}'),
    (hh, 'home', 40, 'insights', 'Worth knowing', '{"span": "half"}'),
    (hh, 'home', 50, 'recent', 'Recent', '{"limit": 5, "span": "half"}'),
    (hh, 'plan', 10, 'goals', 'Goals', '{"span": "wide"}'),
    (hh, 'plan', 20, 'upcoming', 'Coming up', '{"span": "third"}'),
    (hh, 'plan', 30, 'budgets', 'Budgets', '{"limit": 0, "span": "full"}'),
    (hh, 'plan', 40, 'net_worth', 'Net worth', '{"span": "wide"}'),
    (hh, 'plan', 50, 'owed', 'Money owed', '{"span": "third"}'),
    (hh, 'plan', 60, 'debts', 'Debt-free plan', '{"method": "avalanche", "extra": 0, "span": "full"}'),
    (hh, 'analysis', 10, 'outlook', 'Insights', '{"span": "full"}'),
    (hh, 'analysis', 20, 'savings_rate', 'Savings rate', '{"months": 12, "span": "half"}'),
    (hh, 'analysis', 30, 'cashflow', 'Money in and out', '{"months": 12, "span": "half"}'),
    (hh, 'checkin', 10, 'week', 'Last 7 days', '{"span": "half"}'),
    (hh, 'checkin', 20, 'review', 'To look at', '{"limit": 8, "span": "half"}'),
    (hh, 'checkin', 30, 'upcoming', 'Coming up', '{"span": "third"}'),
    (hh, 'checkin', 40, 'budgets', 'Budgets this month', '{"limit": 0, "span": "wide"}');
$$;

--
-- Name: first_household_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.first_household_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    if exists (select 1 from households) then
      raise exception 'not invited' using hint = 'This Nest Ledger is private. Ask its owner to invite you.';
    end if;
    new.owner_id := coalesce(new.owner_id, auth.uid());
  end if;
  return new;
end;
$$;

--
-- Name: invite_member(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_member(invite_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  hh   uuid;
  mail text := lower(trim(invite_email));
  tok  text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select id into hh from households where owner_id = auth.uid();
  if hh is null then raise exception 'only the owner can invite people'; end if;
  if exists (select 1 from invites where email = mail and household_id <> hh) then
    raise exception 'that email is already invited somewhere else';
  end if;
  if exists (select 1 from members where email = mail) then raise exception 'that person is already in the household'; end if;
  insert into invites (email, household_id, invited_by, token, expires_at)
    values (mail, hh, auth.uid(), tok, now() + interval '7 days')
    on conflict (email) do update set invited_by = excluded.invited_by, token = excluded.token,
      expires_at = excluded.expires_at, created_at = now();
  return tok;
end;
$$;

--
-- Name: FUNCTION invite_member(invite_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.invite_member(invite_email text) IS 'Owner only. Invites an email for 7 days and returns the join link token; inviting the same email again makes a new link and the old one stops working.';

--
-- Name: is_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_member(hh uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from members where user_id = auth.uid() and household_id = hh)
$$;

--
-- Name: member_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.member_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if exists (select 1 from households where id = new.household_id and owner_id = new.user_id) then
    new.role := 'owner';
  end if;
  return new;
end;
$$;

--
-- Name: my_households(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_households() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select household_id from members where user_id = (select auth.uid())
$$;

--
-- Name: FUNCTION my_households(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.my_households() IS 'The households the signed-in person belongs to. Used by row-level security policies as (select my_households()).';

--
-- Name: owns_account(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owns_account(acc uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from accounts where id = acc and is_member(household_id))
$$;

--
-- Name: owns_transaction(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owns_transaction(tx uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from transactions where id = tx and is_member(household_id))
$$;

--
-- Name: record_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and o = n then return null; end if;
  insert into history (household_id, table_name, row_id, op, old, new, actor)
  values (
    coalesce((coalesce(n, o) ->> 'household_id')::uuid, default_household()),
    tg_table_name, (coalesce(n, o) ->> 'id')::uuid, tg_op, o, n,
    coalesce((select display_name from members where user_id = auth.uid()), current_user)
  );
  return null;
end;
$$;

--
-- Name: record_transfer(uuid, uuid, bigint, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date DEFAULT CURRENT_DATE, note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  tid uuid := gen_random_uuid();
  hh uuid;
  bucket uuid;
  out_id uuid;
  in_id uuid;
  label text;
begin
  if amount_cents <= 0 then raise exception 'amount_cents must be positive'; end if;
  select household_id into hh from accounts where id = from_account;
  if hh is null or not exists (select 1 from accounts where id = to_account and household_id = hh) then
    raise exception 'both accounts must belong to the same household';
  end if;
  -- a credit card payment gets its own bucket when there is one; anything else is "Between accounts"
  select b.id into bucket from buckets b
   where b.household_id = hh and b.kind = 'transfer' and not b.archived
   order by (b.name = case when (select is_debt from accounts where id = to_account) then 'Credit card payment' else 'Between accounts' end) desc, b.sort
   limit 1;
  label := 'Transfer: ' || (select name from accounts where id = from_account) || ' to ' || (select name from accounts where id = to_account);

  insert into transactions (household_id, account_id, date, merchant, amount_cents, source, transfer_id, note, verified)
    values (hh, from_account, on_date, label, -amount_cents, 'transfer', tid, note, true) returning id into out_id;
  insert into splits (transaction_id, bucket_id, amount_cents) values (out_id, bucket, -amount_cents);
  insert into transactions (household_id, account_id, date, merchant, amount_cents, source, transfer_id, note, verified)
    values (hh, to_account, on_date, label, amount_cents, 'transfer', tid, note, true) returning id into in_id;
  insert into splits (transaction_id, bucket_id, amount_cents) values (in_id, bucket, amount_cents);
  return tid;
end;
$$;

--
-- Name: FUNCTION record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date, note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date, note text) IS 'Moves money between two of our accounts: writes the money out and the money in as two linked transactions (same transfer_id) in the transfer bucket. Neither side counts as spending or income. Returns the transfer_id.';

--
-- Name: undo_change(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_change(change_id bigint) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  h history;
  cols text;
begin
  select * into h from history where id = change_id;
  if h.id is null then raise exception 'No change %', change_id; end if;
  if h.op = 'INSERT' then
    execute format('delete from %I where id = $1', h.table_name) using h.row_id;
  elsif h.op = 'DELETE' then
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', h.table_name, h.table_name) using h.old;
  else
    select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(h.old) k where k <> 'id';
    execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2',
                   h.table_name, cols, cols, h.table_name) using h.old, h.row_id;
  end if;
  return format('Reverted %s on %s', lower(h.op), h.table_name);
end;
$_$;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    name text NOT NULL,
    institution text,
    kind text DEFAULT 'chequing'::text NOT NULL,
    currency text DEFAULT 'CAD'::text NOT NULL,
    owner_id uuid,
    is_debt boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.accounts IS 'Bank accounts, cards, cash, loans, investments. Add a row for a new one. Everyone in the household sees all accounts.';

--
-- Name: COLUMN accounts.institution; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.institution IS 'Free text: the bank, card company or app, e.g. Chase, Barclays, Revolut.';

--
-- Name: COLUMN accounts.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.kind IS 'Free text. Used so far: chequing, savings, credit_card, cash, student_loan, line_of_credit, investments, other.';

--
-- Name: COLUMN accounts.is_debt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_debt IS 'true for money owed (cards, loans). Net worth subtracts these.';

--
-- Name: COLUMN accounts.attrs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.attrs IS 'Anything extra. For debts: {"apr": 19.99, "min_payment_cents": 1000, "due_day": 15}.';

--
-- Name: ai_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE ai_insights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_insights IS 'One run of the ChatGPT reader. items: [{kind: "insight", tone: good|warn|info, icon, text} | {kind: "pattern", icon, title, gist, detail}]. Every number in the text came from the app''s own facts. Delete rows to clear them; the app falls back to its own insights.';

--
-- Name: balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    balance_cents bigint NOT NULL
);

--
-- Name: TABLE balances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.balances IS 'Account balance on a date, for net worth over time. Debts are positive amounts owed.';

--
-- Name: buckets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    kind text DEFAULT 'spend'::text NOT NULL,
    icon text,
    color text,
    sort integer DEFAULT 100 NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    target_cents bigint,
    target_date date,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE buckets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.buckets IS 'Categories and goals, as a tree (parent_id). Adding a bucket = inserting a row; it appears in every chart, list and picker. Archive instead of deleting to keep history.';

--
-- Name: COLUMN buckets.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buckets.kind IS 'Free text. spend (counts as spending), income (counts as income), transfer (moving our own money: never spending or income), saving, goal, lent (money we paid for someone else or lent out; not our spending). Any other word works and is treated like transfer.';

--
-- Name: COLUMN buckets.icon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buckets.icon IS 'Any Lucide icon name in kebab case (lucide.dev/icons), e.g. shopping-cart, baby, house.';

--
-- Name: COLUMN buckets.color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buckets.color IS '1-8 for the app palette (1 green, 2 amber, 3 blue, 4 purple, 5 orange, 6 pink, 7 teal, 8 grey) or any CSS color. Empty = picked automatically.';

--
-- Name: COLUMN buckets.target_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.buckets.target_cents IS 'For goals: the amount to reach.';

--
-- Name: bucket_tree; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bucket_tree WITH (security_invoker='true') AS
 WITH RECURSIVE t AS (
         SELECT buckets.id,
            buckets.household_id,
            buckets.name,
            buckets.kind,
            buckets.id AS root_id,
            buckets.name AS root_name,
            buckets.name AS path,
            0 AS depth
           FROM public.buckets
          WHERE (buckets.parent_id IS NULL)
        UNION ALL
         SELECT b.id,
            b.household_id,
            b.name,
            b.kind,
            t_1.root_id,
            t_1.root_name,
            ((t_1.path || ' / '::text) || b.name),
            (t_1.depth + 1)
           FROM (public.buckets b
             JOIN t t_1 ON ((b.parent_id = t_1.id)))
        )
 SELECT id,
    household_id,
    name,
    kind,
    root_id,
    root_name,
    path,
    depth
   FROM t;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    bucket_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    period text DEFAULT 'month'::text NOT NULL,
    starts date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date NOT NULL,
    ends date,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE budgets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.budgets IS 'How much a bucket may use per period. To change a budget from a date, set ends on the old row and add a new row with starts.';

--
-- Name: COLUMN budgets.period; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.period IS 'month, week, quarter or year.';

--
-- Name: COLUMN budgets.attrs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.attrs IS 'Anything extra. {"rollover": true} on a monthly budget: what is left (or over) at the end of a month carries into the next, counted back over up to 12 months of rolling budgets; a month without rollover starts the count again.';

--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    kind text DEFAULT 'receipt'::text NOT NULL,
    storage_path text,
    extracted jsonb,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.documents IS 'Receipt photos and statement files. extracted holds what was read from them, as JSON.';

--
-- Name: history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.history (
    id bigint NOT NULL,
    household_id uuid,
    table_name text NOT NULL,
    row_id uuid,
    op text NOT NULL,
    old jsonb,
    new jsonb,
    actor text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.history IS 'Every insert, update and delete on the money tables, written automatically. Revert one with select undo_change(id).';

--
-- Name: history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.households (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Our household'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid
);

--
-- Name: COLUMN households.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.households.owner_id IS 'The member who set the household up. Only the owner can invite people.';

--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    email text NOT NULL,
    household_id uuid NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token text,
    expires_at timestamp with time zone
);

--
-- Name: COLUMN invites.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invites.token IS 'The secret in the join link (/join/<token>). Only the server reads it, with the service role.';

--
-- Name: COLUMN invites.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invites.expires_at IS 'After this the invite and its join link no longer work. Null = no limit (invites from before join links).';

--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    user_id uuid NOT NULL,
    household_id uuid NOT NULL,
    display_name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar text,
    role text DEFAULT 'member'::text NOT NULL
);

--
-- Name: COLUMN members.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.members.role IS 'Free text: owner or member. The owner can invite people; a member cannot. Members cannot change their own role.';

--
-- Name: splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.splits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    bucket_id uuid,
    amount_cents bigint NOT NULL,
    note text,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: TABLE splits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.splits IS 'The category breakdown of a transaction. Same sign as the transaction. A Superstore receipt can have Groceries, Baby and Household splits.';

--
-- Name: COLUMN splits.bucket_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.splits.bucket_id IS 'null = not categorized yet.';

--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    name text NOT NULL,
    color text
);

--
-- Name: TABLE tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tags IS 'Labels that cut across buckets: reimbursable, tax-deductible, trip names...';

--
-- Name: transaction_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    tag_id uuid NOT NULL
);

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    account_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    merchant text NOT NULL,
    amount_cents bigint NOT NULL,
    orig_currency text,
    orig_amount numeric(14,2),
    source text DEFAULT 'manual'::text NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    document_id uuid,
    recurring_id uuid,
    import_hash text,
    note text,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    transfer_id uuid
);

--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions IS 'One purchase, payment or deposit. Its categories are in splits (one split per bucket; splits add up to amount_cents).';

--
-- Name: COLUMN transactions.amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.amount_cents IS 'Integer cents in the household''s currency. Negative = money out, positive = money in. 14.50 spent = -1450.';

--
-- Name: COLUMN transactions.orig_currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.orig_currency IS 'For foreign purchases: the original currency and amount; amount_cents stays in the household''s currency.';

--
-- Name: COLUMN transactions.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.source IS 'Where it came from: manual, quick, receipt, statement, chatgpt, claude...';

--
-- Name: COLUMN transactions.needs_review; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.needs_review IS 'Set true when unsure (unclear amount, guessed category). The app lists these for a person to check.';

--
-- Name: COLUMN transactions.verified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.verified IS 'true once matched to a bank statement line.';

--
-- Name: COLUMN transactions.import_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.import_hash IS 'Set when importing statement lines, so the same line is never imported twice for an account.';

--
-- Name: COLUMN transactions.transfer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.transfer_id IS 'Links the two sides of a move between our own accounts (chequing to savings, paying a credit card). Both rows get the same uuid: the money out (negative) on one account and the money in (positive) on the other, each with one split in a bucket of kind transfer. Use record_transfer() to create both at once, or set the same transfer_id on two imported statement lines that match.';

--
-- Name: lines; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.lines WITH (security_invoker='true') AS
 SELECT s.id AS split_id,
    t.id AS transaction_id,
    t.household_id,
    t.date,
    (date_trunc('month'::text, (t.date)::timestamp with time zone))::date AS month,
    t.merchant,
    s.amount_cents,
    t.account_id,
    a.name AS account,
    s.bucket_id,
    COALESCE(bt.name, 'Uncategorized'::text) AS bucket,
    COALESCE(bt.root_name, 'Uncategorized'::text) AS top_bucket,
    COALESCE(bt.kind,
        CASE
            WHEN (s.amount_cents < 0) THEN 'spend'::text
            ELSE 'income'::text
        END) AS kind,
    m.display_name AS person,
    t.source,
    t.needs_review,
    t.verified,
    COALESCE(( SELECT array_agg(g.name) AS array_agg
           FROM (public.transaction_tags tt
             JOIN public.tags g ON ((g.id = tt.tag_id)))
          WHERE (tt.transaction_id = t.id)), '{}'::text[]) AS tags,
    t.transfer_id
   FROM ((((public.splits s
     JOIN public.transactions t ON ((t.id = s.transaction_id)))
     JOIN public.accounts a ON ((a.id = t.account_id)))
     LEFT JOIN public.bucket_tree bt ON ((bt.id = s.bucket_id)))
     LEFT JOIN public.members m ON ((m.user_id = t.created_by)));

--
-- Name: VIEW lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.lines IS 'Read-only: one row per split, joined with account, bucket path, kind and person. Use it for any report or chart.';

--
-- Name: monthly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.monthly WITH (security_invoker='true') AS
 SELECT household_id,
    month,
    bucket_id,
    bucket,
    top_bucket,
    kind,
    (sum(amount_cents))::bigint AS amount_cents,
    count(*) AS lines
   FROM public.lines
  GROUP BY household_id, month, bucket_id, bucket, top_bucket, kind;

--
-- Name: owed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owed (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    person text NOT NULL,
    amount_cents bigint NOT NULL,
    reason text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    settled_on date,
    transaction_id uuid,
    settled_transaction_id uuid,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE owed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.owed IS 'Money other people owe us, or we owe them. One row per IOU. Positive amount_cents = they owe us (we paid for them or lent them money); negative = we owe them. Set settled_on (and settled_transaction_id) when it is paid back; never delete. When we pay for someone, put their share of the purchase in a bucket of kind lent (e.g. "Lent to others") so it is not counted as our spending, and put the repayment in the same bucket.';

--
-- Name: COLUMN owed.person; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.owed.person IS 'Free text: the person''s name as we say it ("Omar", "Mom", "Sara from the lab"). Keep the same spelling for the same person.';

--
-- Name: COLUMN owed.amount_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.owed.amount_cents IS 'Integer cents in the household''s currency. Positive = they owe us. Negative = we owe them. A partial repayment is a new row with the opposite sign and the same person, or update the amount.';

--
-- Name: COLUMN owed.transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.owed.transaction_id IS 'The purchase or transfer that created the debt, when there is one.';

--
-- Name: COLUMN owed.settled_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.owed.settled_transaction_id IS 'The transaction that paid it back, when there is one.';

--
-- Name: owed_by_person; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.owed_by_person WITH (security_invoker='true') AS
 SELECT household_id,
    person,
    (sum(amount_cents))::bigint AS amount_cents,
    count(*) AS items,
    min(date) AS since,
    min(due_date) AS next_due
   FROM public.owed
  WHERE (settled_on IS NULL)
  GROUP BY household_id, person
 HAVING (sum(amount_cents) <> (0)::numeric);

--
-- Name: VIEW owed_by_person; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.owed_by_person IS 'Read-only: what is still open per person. Positive = they owe us, negative = we owe them.';

--
-- Name: recurring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    merchant text NOT NULL,
    amount_cents bigint NOT NULL,
    cadence text DEFAULT 'monthly'::text NOT NULL,
    next_date date,
    account_id uuid,
    bucket_id uuid,
    active boolean DEFAULT true NOT NULL,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: TABLE recurring; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.recurring IS 'Expected repeating bills and income. cadence: weekly, biweekly, monthly, yearly. attrs rules, merchant matched as text ignoring case and spaces: {"exclude_from_detection": true} with active = false leaves the merchant out of recurring detection; {"counts_for": "next_month", "from_day": 25} with active = true counts a payment in the month after it lands (from_day optional: only payments on or after that day), for rent sent in the last days of a month or income paid ahead.';

--
-- Name: rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    pattern text NOT NULL,
    bucket_id uuid NOT NULL,
    attrs jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: TABLE rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rules IS 'Auto-categorization: a merchant whose lower-case text contains pattern goes to bucket_id. Longest matching pattern wins.';

--
-- Name: saved_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    name text NOT NULL,
    query text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    page text DEFAULT 'analysis'::text NOT NULL
);

--
-- Name: TABLE saved_views; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.saved_views IS 'Named views of the Analysis tab, shared by the household. query is the URL search string, e.g. q=baby+2025&g=bucket&m=spend&c=year. Add one to give the household a one-tap view.';

--
-- Name: COLUMN saved_views.query; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.saved_views.query IS 'URL parameters: q = smart search text (dates, amounts, buckets, accounts, people, kinds, flags, words); g = group by (top_bucket, bucket, merchant, account, person, month, weekday, day); m = measure (spend, income, net, count); c = compare (prev, year, none); s = sort column.';

--
-- Name: COLUMN saved_views.page; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.saved_views.page IS 'analysis (a saved Analysis view) or activity (a saved Activity search; query is q=…).';

--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    key text NOT NULL,
    value jsonb
);

--
-- Name: TABLE settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settings IS 'Household settings as key/value JSON. Used so far: currency = the household''s currency code, e.g. "CAD" (the app''s NEXT_PUBLIC_CURRENCY decides how money is shown); "checkin" = {"at": timestamp, "by": user id}, the last weekly check-in.';

--
-- Name: transfers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.transfers WITH (security_invoker='true') AS
 SELECT t_out.transfer_id,
    t_out.household_id,
    t_out.date,
    t_out.account_id AS from_account_id,
    a_out.name AS from_account,
    t_in.account_id AS to_account_id,
    a_in.name AS to_account,
    t_in.amount_cents,
    COALESCE(t_out.note, t_in.note) AS note
   FROM (((public.transactions t_out
     JOIN public.transactions t_in ON (((t_in.transfer_id = t_out.transfer_id) AND (t_in.amount_cents > 0))))
     JOIN public.accounts a_out ON ((a_out.id = t_out.account_id)))
     JOIN public.accounts a_in ON ((a_in.id = t_in.account_id)))
  WHERE ((t_out.transfer_id IS NOT NULL) AND (t_out.amount_cents < 0));

--
-- Name: VIEW transfers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.transfers IS 'Read-only: one row per move between our own accounts (both sides joined by transfer_id).';

--
-- Name: widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid DEFAULT public.default_household() NOT NULL,
    page text DEFAULT 'home'::text NOT NULL,
    "position" integer DEFAULT 100 NOT NULL,
    type text NOT NULL,
    title text,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE widgets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.widgets IS 'Dashboard cards, drawn in position order on their page (home, plan, analysis or checkin; a new page name needs a route in the app). Add, edit, reorder or disable rows to change the dashboard.
type and spec:
  summary      {}                                    what was kept, money in/out vs last period, budgets left, budget left per day, items to review
  insights     {}                                    short sentences: pace vs last period, biggest change, budget at risk, bills still to come, weekends, subscriptions
  ai           {}                                    "AI Insights": the household agent''s latest summary and notes (ai_insights); hidden when the newest run is over two days old or a past period is on screen
  outlook      {}                                    the long view over 12 full months: typical month, how long savings last, rising costs, income mix, best month
  pace         {}                                    running total through the selected month, quarter or year vs the one before, with the budget line
  stat         {"measure": "spend"}                  one big number, with last period at the same point
  bars         {"measure": "spend", "group_by": "bucket", "top": 8}
  compare      {"top": 6}                            which top buckets moved vs the same days last period
  share        {"measure": "spend"}                  one strip: five biggest top buckets plus everything else (measure income = where money comes from)
  trend        {"measure": "spend", "months": 6}     one column per month, with the average
  cashflow     {"months": 6}                         money in vs money out per month, with the net
  savings_rate {"months": 12}                        share of income kept each month; below zero when spending went past income
  matrix       {"months": 12, "top": 10}             top buckets × months as a heatmap, each row shaded against its own busiest month
  calendar     {}                                    this month day by day, shaded by spending
  weekday      {}                                    average spending per weekday over the last 12 weeks
  upcoming     {}                                    the rest of this month: month-end estimate, then each regular bill not yet paid
  bills        {}                                    charges that come back every month (3 of the last 4 months), paid or still to come
  balances     {}                                    every account''s balance now (last recorded balance + transactions since): money held, then cards and loans owed
  forecast     {}                                    month-end estimate: everyday accounts today + regular income to come - bills to come - usual daily spending
  debts        {"method": "avalanche", "extra": 0}   debt-free date for accounts with is_debt; needs accounts.attrs.apr (percent) and attrs.min_payment_cents. method avalanche | snowball, extra = cents a month over the minimums
  owed         {}                                    open IOUs per person from the owed table: owed to us, and what we owe
  transfers    {"top": 6}                            moves between our own accounts in the period (transactions sharing a transfer_id)
  merchants    {"top": 8}                            top places: visits, average and total
  budgets      {}                                    progress for every bucket with a budget, most used first
  goals        {}                                    progress for goal buckets, and the monthly amount to hit target_date
  net_worth    {}                                    assets minus debts from balances, with a 12-month history
  recent       {"limit": 5}
  review       {"limit": 5}                          transactions needing a category or review
  week         {}                                    the last 7 days against the 7 before: spending, and the top buckets that made it
  view         {"view": "my_view_name", "limit": 20} any database view, shown as a table
Common spec keys:
  span      full | wide | half | third              width on desktop (phones always stack). On a 6-column desktop row: full 6, wide 4, half 3, third 2;
                                                     keep each row''s cards at similar heights (wide + third, half + half, third + third + third)
  measure   spend | income | net | total (raw sum)
  group_by  bucket | top_bucket | account | person | merchant | month | kind
  period    selected (the switch on screen, default) | month | quarter | year | all
  filter    {"buckets": ["Baby"], "accounts": ["Savings"], "kinds": ["spend"], "people": ["Alex"], "tags": ["trip"]}
            bucket filters include child buckets.';

--
-- Name: COLUMN widgets.page; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.widgets.page IS 'home (a glance at this month), plan (goals, budgets, net worth, forecast, debts, money owed) or analysis (the long view and comparisons, under the explorer). A new page name needs a route in the app.';

--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

--
-- Name: ai_insights ai_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_pkey PRIMARY KEY (id);

--
-- Name: balances balances_account_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balances
    ADD CONSTRAINT balances_account_id_date_key UNIQUE (account_id, date);

--
-- Name: balances balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balances
    ADD CONSTRAINT balances_pkey PRIMARY KEY (id);

--
-- Name: buckets buckets_household_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buckets
    ADD CONSTRAINT buckets_household_id_name_key UNIQUE (household_id, name);

--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);

--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);

--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

--
-- Name: history history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (id);

--
-- Name: households households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_pkey PRIMARY KEY (id);

--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (email);

--
-- Name: invites invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_token_key UNIQUE (token);

--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (user_id);

--
-- Name: owed owed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owed
    ADD CONSTRAINT owed_pkey PRIMARY KEY (id);

--
-- Name: recurring recurring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring
    ADD CONSTRAINT recurring_pkey PRIMARY KEY (id);

--
-- Name: rules rules_household_id_pattern_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_household_id_pattern_key UNIQUE (household_id, pattern);

--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);

--
-- Name: saved_views saved_views_household_page_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_household_page_name_key UNIQUE (household_id, page, name);

--
-- Name: saved_views saved_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_pkey PRIMARY KEY (id);

--
-- Name: settings settings_household_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_household_id_key_key UNIQUE (household_id, key);

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);

--
-- Name: splits splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.splits
    ADD CONSTRAINT splits_pkey PRIMARY KEY (id);

--
-- Name: tags tags_household_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_household_id_name_key UNIQUE (household_id, name);

--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

--
-- Name: transaction_tags transaction_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_tags
    ADD CONSTRAINT transaction_tags_pkey PRIMARY KEY (id);

--
-- Name: transaction_tags transaction_tags_transaction_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_tags
    ADD CONSTRAINT transaction_tags_transaction_id_tag_id_key UNIQUE (transaction_id, tag_id);

--
-- Name: transactions transactions_account_id_import_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_import_hash_key UNIQUE (account_id, import_hash);

--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

--
-- Name: widgets widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.widgets
    ADD CONSTRAINT widgets_pkey PRIMARY KEY (id);

--
-- Name: ai_insights_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_insights_latest ON public.ai_insights USING btree (household_id, generated_at DESC);

--
-- Name: history_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX history_at ON public.history USING btree (at DESC);

--
-- Name: owed_household_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owed_household_open ON public.owed USING btree (household_id) WHERE (settled_on IS NULL);

--
-- Name: splits_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX splits_bucket ON public.splits USING btree (bucket_id);

--
-- Name: splits_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX splits_transaction ON public.splits USING btree (transaction_id);

--
-- Name: transactions_household_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_household_date ON public.transactions USING btree (household_id, date DESC);

--
-- Name: transactions_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_transfer ON public.transactions USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);

--
-- Name: accounts accounts_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_history AFTER INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: balances balances_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER balances_history AFTER INSERT OR DELETE OR UPDATE ON public.balances FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: buckets buckets_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER buckets_history AFTER INSERT OR DELETE OR UPDATE ON public.buckets FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: budgets budgets_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER budgets_history AFTER INSERT OR DELETE OR UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: documents documents_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_history AFTER INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: households households_first_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER households_first_only BEFORE INSERT ON public.households FOR EACH ROW EXECUTE FUNCTION public.first_household_only();

--
-- Name: members members_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER members_role BEFORE INSERT ON public.members FOR EACH ROW EXECUTE FUNCTION public.member_role();

--
-- Name: owed owed_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER owed_history AFTER INSERT OR DELETE OR UPDATE ON public.owed FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: recurring recurring_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recurring_history AFTER INSERT OR DELETE OR UPDATE ON public.recurring FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: rules rules_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rules_history AFTER INSERT OR DELETE OR UPDATE ON public.rules FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: saved_views saved_views_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER saved_views_history AFTER INSERT OR DELETE OR UPDATE ON public.saved_views FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: settings settings_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settings_history AFTER INSERT OR DELETE OR UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: splits splits_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER splits_history AFTER INSERT OR DELETE OR UPDATE ON public.splits FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: tags tags_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tags_history AFTER INSERT OR DELETE OR UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: transaction_tags transaction_tags_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transaction_tags_history AFTER INSERT OR DELETE OR UPDATE ON public.transaction_tags FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: transactions transactions_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_history AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: widgets widgets_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER widgets_history AFTER INSERT OR DELETE OR UPDATE ON public.widgets FOR EACH ROW EXECUTE FUNCTION public.record_history();

--
-- Name: accounts accounts_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: accounts accounts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: ai_insights ai_insights_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: balances balances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balances
    ADD CONSTRAINT balances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

--
-- Name: buckets buckets_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buckets
    ADD CONSTRAINT buckets_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: buckets buckets_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buckets
    ADD CONSTRAINT buckets_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.buckets(id) ON DELETE SET NULL;

--
-- Name: budgets budgets_bucket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.buckets(id) ON DELETE CASCADE;

--
-- Name: budgets budgets_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: documents documents_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: households households_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: invites invites_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: invites invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: members members_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: members members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: owed owed_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owed
    ADD CONSTRAINT owed_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: owed owed_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owed
    ADD CONSTRAINT owed_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: owed owed_settled_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owed
    ADD CONSTRAINT owed_settled_transaction_id_fkey FOREIGN KEY (settled_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;

--
-- Name: owed owed_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owed
    ADD CONSTRAINT owed_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;

--
-- Name: recurring recurring_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring
    ADD CONSTRAINT recurring_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

--
-- Name: recurring recurring_bucket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring
    ADD CONSTRAINT recurring_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.buckets(id) ON DELETE SET NULL;

--
-- Name: recurring recurring_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring
    ADD CONSTRAINT recurring_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: rules rules_bucket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.buckets(id) ON DELETE CASCADE;

--
-- Name: rules rules_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: saved_views saved_views_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: saved_views saved_views_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: settings settings_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: splits splits_bucket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.splits
    ADD CONSTRAINT splits_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.buckets(id) ON DELETE SET NULL;

--
-- Name: splits splits_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.splits
    ADD CONSTRAINT splits_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

--
-- Name: tags tags_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: transaction_tags transaction_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_tags
    ADD CONSTRAINT transaction_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

--
-- Name: transaction_tags transaction_tags_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_tags
    ADD CONSTRAINT transaction_tags_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

--
-- Name: transactions transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: transactions transactions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

--
-- Name: transactions transactions_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: transactions transactions_recurring_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES public.recurring(id) ON DELETE SET NULL;

--
-- Name: widgets widgets_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.widgets
    ADD CONSTRAINT widgets_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_household ON public.accounts USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: ai_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_insights ai_insights_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_insights_household ON public.ai_insights USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;

--
-- Name: balances balances_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY balances_household ON public.balances USING ((account_id IN ( SELECT accounts.id
   FROM public.accounts))) WITH CHECK ((account_id IN ( SELECT accounts.id
   FROM public.accounts)));

--
-- Name: buckets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets buckets_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buckets_household ON public.buckets USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets budgets_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY budgets_household ON public.budgets USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_household ON public.documents USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

--
-- Name: history history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY history_read ON public.history FOR SELECT USING ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: households household_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY household_read ON public.households FOR SELECT USING ((id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: households household_rename; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY household_rename ON public.households FOR UPDATE USING ((id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: households; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

--
-- Name: invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

--
-- Name: invites invites_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invites_read ON public.invites FOR SELECT USING ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_read ON public.members FOR SELECT USING ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: members members_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_self ON public.members FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: owed; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.owed ENABLE ROW LEVEL SECURITY;

--
-- Name: owed owed_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owed_household ON public.owed USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: recurring; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring recurring_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recurring_household ON public.recurring USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

--
-- Name: rules rules_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rules_household ON public.rules USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: saved_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_views saved_views_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_views_household ON public.saved_views USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings settings_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_household ON public.settings USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: splits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.splits ENABLE ROW LEVEL SECURITY;

--
-- Name: splits splits_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY splits_household ON public.splits USING ((transaction_id IN ( SELECT transactions.id
   FROM public.transactions))) WITH CHECK ((transaction_id IN ( SELECT transactions.id
   FROM public.transactions)));

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_household ON public.tags USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: transaction_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_tags transaction_tags_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_tags_household ON public.transaction_tags USING ((transaction_id IN ( SELECT transactions.id
   FROM public.transactions))) WITH CHECK ((transaction_id IN ( SELECT transactions.id
   FROM public.transactions)));

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_household ON public.transactions USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: widgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: widgets widgets_household; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY widgets_household ON public.widgets USING ((household_id IN ( SELECT public.my_households() AS my_households))) WITH CHECK ((household_id IN ( SELECT public.my_households() AS my_households)));

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO authenticated;

--
-- Name: FUNCTION bootstrap_member(home_currency text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bootstrap_member(home_currency text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bootstrap_member(home_currency text) TO authenticated;

--
-- Name: FUNCTION default_household(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.default_household() FROM PUBLIC;
GRANT ALL ON FUNCTION public.default_household() TO authenticated;

--
-- Name: FUNCTION default_widgets(hh uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.default_widgets(hh uuid) FROM PUBLIC;

--
-- Name: FUNCTION first_household_only(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.first_household_only() FROM PUBLIC;

--
-- Name: FUNCTION invite_member(invite_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.invite_member(invite_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_member(invite_email text) TO authenticated;

--
-- Name: FUNCTION is_member(hh uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_member(hh uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_member(hh uuid) TO authenticated;

--
-- Name: FUNCTION member_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.member_role() FROM PUBLIC;

--
-- Name: FUNCTION my_households(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_households() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_households() TO authenticated;

--
-- Name: FUNCTION owns_account(acc uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.owns_account(acc uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.owns_account(acc uuid) TO authenticated;

--
-- Name: FUNCTION owns_transaction(tx uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.owns_transaction(tx uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.owns_transaction(tx uuid) TO authenticated;

--
-- Name: FUNCTION record_history(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_history() FROM PUBLIC;

--
-- Name: FUNCTION record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date, note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date, note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_transfer(from_account uuid, to_account uuid, amount_cents bigint, on_date date, note text) TO authenticated;

--
-- Name: FUNCTION undo_change(change_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.undo_change(change_id bigint) FROM PUBLIC;

--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts TO authenticated;

--
-- Name: TABLE ai_insights; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_insights TO authenticated;
GRANT ALL ON TABLE public.ai_insights TO service_role;

--
-- Name: TABLE balances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.balances TO authenticated;

--
-- Name: TABLE buckets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.buckets TO authenticated;

--
-- Name: TABLE bucket_tree; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bucket_tree TO authenticated;

--
-- Name: TABLE budgets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.budgets TO authenticated;

--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.documents TO authenticated;

--
-- Name: TABLE history; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.history TO authenticated;

--
-- Name: TABLE households; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.households TO authenticated;

--
-- Name: COLUMN households.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.households TO authenticated;

--
-- Name: COLUMN invites.email; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(email) ON TABLE public.invites TO authenticated;

--
-- Name: COLUMN invites.household_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(household_id) ON TABLE public.invites TO authenticated;

--
-- Name: COLUMN invites.invited_by; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(invited_by) ON TABLE public.invites TO authenticated;

--
-- Name: COLUMN invites.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.invites TO authenticated;

--
-- Name: COLUMN invites.expires_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(expires_at) ON TABLE public.invites TO authenticated;

--
-- Name: TABLE members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.members TO authenticated;

--
-- Name: COLUMN members.display_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(display_name) ON TABLE public.members TO authenticated;

--
-- Name: COLUMN members.avatar; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(avatar) ON TABLE public.members TO authenticated;

--
-- Name: TABLE splits; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.splits TO authenticated;

--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tags TO authenticated;

--
-- Name: TABLE transaction_tags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transaction_tags TO authenticated;

--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactions TO authenticated;

--
-- Name: TABLE lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lines TO authenticated;

--
-- Name: TABLE monthly; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.monthly TO authenticated;

--
-- Name: TABLE owed; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.owed TO authenticated;

--
-- Name: TABLE recurring; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recurring TO authenticated;

--
-- Name: TABLE rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rules TO authenticated;

--
-- Name: TABLE saved_views; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.saved_views TO authenticated;

--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settings TO authenticated;

--
-- Name: TABLE widgets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.widgets TO authenticated;

--
--
