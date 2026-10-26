-- Whether this copy has been set up, answerable before anyone signs in, so /login and /setup know where to send
-- people without the service role key. It says only yes or no.
-- And new functions are no longer callable by signed-out visitors unless a migration grants it on purpose.

create function is_set_up() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from households)
$$;
comment on function is_set_up() is 'True once the first person has set the household up. The only function a signed-out visitor may call.';
revoke execute on function is_set_up() from public;
grant execute on function is_set_up() to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
