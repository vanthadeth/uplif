-- Migration 15: lets the super-admin app ask "am I a platform admin?" without opening platform_admins.
-- The table stays closed to the API (no grants, no policies); only this yes/no function can see it, and it
-- only ever answers about the caller.
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
