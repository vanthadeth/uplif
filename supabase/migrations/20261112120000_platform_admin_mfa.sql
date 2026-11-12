-- Migration 23: platform admins need a second sign-in step (an authenticator-app code).
-- Every platform_* function starts with app.assert_platform_admin(), so requiring the "aal2" level here
-- covers all of them at once. A session that signed in with Google only (aal1) is refused, even if the
-- person is a platform admin. The app also redirects to the code screen, but this is the real lock.
create or replace function app.assert_platform_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not exists (select 1 from public.platform_admins where user_id = uid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    raise exception 'second step required' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke all on function app.assert_platform_admin() from public, anon, authenticated;
