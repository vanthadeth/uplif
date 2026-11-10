-- Migration 2: private app helpers, permission catalog, access-token hook.
-- JWT carries only company_id and membership_id (in app_metadata). Permissions are read live.

create function app.company_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid
$$;

create function app.membership_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'membership_id', '')::uuid
$$;

-- True only if the claimed membership is live, active, in the claimed company and belongs to the caller.
create function app.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.id = app.membership_id()
      and m.company_id = app.company_id()
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

-- Widest data scope the caller holds for a permission key, or null if none.
-- A role assigned to a specific branch is capped at 'branch'.
create function app.permission_scope(p_key text) returns public.data_scope
language sql stable security definer set search_path = '' as $$
  select case when mr.branch_id is not null and rp.data_scope = 'company'
              then 'branch'::public.data_scope else rp.data_scope end as scope
  from public.role_permissions rp
  join public.membership_roles mr
    on mr.role_id = rp.role_id and mr.company_id = rp.company_id
  join public.memberships m
    on m.id = mr.membership_id and m.company_id = mr.company_id
  where rp.permission_key = p_key
    and m.id = app.membership_id()
    and m.company_id = app.company_id()
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  order by 1 desc
  limit 1
$$;

-- Branches the caller is assigned to through branch-specific role assignments.
create function app.my_branch_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct mr.branch_id), '{}')
  from public.membership_roles mr
  join public.memberships m
    on m.id = mr.membership_id and m.company_id = mr.company_id
  where mr.branch_id is not null
    and m.id = app.membership_id()
    and m.company_id = app.company_id()
    and m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

-- Supabase Auth hook: adds company_id and membership_id to app_metadata.
-- Enable under Authentication > Hooks > Customize Access Token (JWT) Claims: app.custom_access_token_hook
create function app.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (event ->> 'user_id')::uuid;
  mid uuid;
  cid uuid;
  claims jsonb := event -> 'claims';
  meta jsonb := coalesce(event -> 'claims' -> 'app_metadata', '{}'::jsonb) - 'company_id' - 'membership_id';
begin
  select m.id, m.company_id into mid, cid
  from public.memberships m
  left join app.user_context uc
    on uc.user_id = m.user_id and uc.active_membership_id = m.id
  where m.user_id = uid and m.status = 'active'
  order by (uc.user_id is not null) desc, m.created_at, m.id
  limit 1;

  if mid is not null then
    meta := meta || jsonb_build_object('company_id', cid, 'membership_id', mid);
  end if;
  claims := jsonb_set(claims, '{app_metadata}', meta);
  return jsonb_set(event, '{claims}', claims);
end $$;

insert into public.permissions (key, description) values
  ('org.company.update', 'Edit company profile'),
  ('org.branch.read', 'View branches'),
  ('org.branch.create', 'Create branches'),
  ('org.branch.update', 'Edit branches'),
  ('org.branch.delete', 'Delete branches'),
  ('org.member.read', 'View team members'),
  ('org.member.update', 'Edit or suspend team members'),
  ('org.role.read', 'View roles and assignments'),
  ('org.role.manage', 'Create roles, edit their permissions and assign them'),
  ('org.settings.update', 'Edit company settings'),
  ('org.currency.manage', 'Manage company currencies'),
  ('org.payment_term.manage', 'Manage payment terms');

revoke all on all functions in schema app from public, anon, authenticated;
grant usage on schema app to authenticated, supabase_auth_admin;
grant execute on function app.company_id(), app.membership_id(), app.is_active_member(),
  app.permission_scope(text), app.my_branch_ids() to authenticated;
grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
