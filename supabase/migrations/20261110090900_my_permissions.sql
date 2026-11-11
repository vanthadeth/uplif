-- Migration 10: the caller's own permissions, so the console can hide menu items they cannot use.
-- This is cosmetic: every table is still protected by RLS. Same rules as app.permission_scope(),
-- for all keys at once: the claimed membership must be live, active and the caller's own, and a
-- role assigned to one branch is capped at 'branch'.
create function public.my_permissions() returns table (permission_key text, data_scope public.data_scope)
language sql stable security definer set search_path = '' as $$
  select rp.permission_key,
         max(case when mr.branch_id is not null and rp.data_scope = 'company'
                  then 'branch'::public.data_scope else rp.data_scope end)
  from public.role_permissions rp
  join public.membership_roles mr
    on mr.role_id = rp.role_id and mr.company_id = rp.company_id
  join public.memberships m
    on m.id = mr.membership_id and m.company_id = mr.company_id
  where m.id = app.membership_id()
    and m.company_id = app.company_id()
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  group by rp.permission_key
$$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;
