-- Registration flow, slice R1: which plan modules the caller's active company has, so the welcome screen can
-- show only the apps that company can use. Cosmetic: every table and call is still protected by RLS and the
-- module checks inside them. Same membership rules as my_permissions(): the claimed membership must be live,
-- active and the caller's own. A company with no plan row keeps every module on, like app.module_enabled().
create function public.my_enabled_modules() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select coalesce(pl.modules, array['attendance', 'field_sales', 'inventory']::text[])
     from public.memberships m
     left join public.plans pl on pl.id = (app.company_plan(m.company_id)).id
     where m.id = app.membership_id()
       and m.company_id = app.company_id()
       and m.user_id = (select auth.uid())
       and m.status = 'active'),
    '{}'::text[])
$$;

revoke all on function public.my_enabled_modules() from public, anon;
grant execute on function public.my_enabled_modules() to authenticated;
