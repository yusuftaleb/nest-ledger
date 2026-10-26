-- Sign-in, emailed codes and the setup password are rate-limited. Each try is a row keyed by a hash of what was tried
-- and from where (never the email or address itself); allow_attempt() counts the recent ones and says yes or no.
-- Only the server calls it, with the service role; nobody signed in or out can read the table or call the function.

create table attempts (
  key text not null,
  at  timestamptz not null default now()
);
create index attempts_key_at on attempts (key, at);
alter table attempts enable row level security;
comment on table attempts is 'Recent sign-in, code and setup tries, for rate limits. key is a hash; rows older than a day are cleared as new ones come in. No policies: only allow_attempt() touches it.';

create function allow_attempt(attempt_key text, max_attempts int, per_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from attempts where at < now() - interval '1 day';
  select count(*) into n from attempts where key = attempt_key and at > now() - make_interval(secs => per_seconds);
  if n >= max_attempts then return false; end if;
  insert into attempts (key) values (attempt_key);
  return true;
end;
$$;
comment on function allow_attempt(text, int, int) is 'Records a try under attempt_key and returns false when there were already max_attempts in the last per_seconds. Server only.';
revoke execute on function allow_attempt(text, int, int) from public, anon, authenticated;
grant execute on function allow_attempt(text, int, int) to service_role;
revoke all on attempts from anon, authenticated;
