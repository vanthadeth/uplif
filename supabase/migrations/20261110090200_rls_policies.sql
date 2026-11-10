-- Migration 3: row-level security policies and minimal grants for the authenticated role.
-- Every policy pins company_id to the caller's company; writes need a permission at company scope.
-- anon gets nothing. Inserts into companies/memberships/company_settings happen only via the signup flow (later).

create function app.forbid_membership_user_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '23000';
  end if;
  return new;
end $$;
create trigger immutable_user_memberships before update on public.memberships
  for each row execute function app.forbid_membership_user_change();

-- companies
create policy companies_select on public.companies for select to authenticated
  using (id = (select app.company_id()) and (select app.is_active_member()));
create policy companies_update on public.companies for update to authenticated
  using (id = (select app.company_id()) and (select app.permission_scope('org.company.update')) = 'company')
  with check (id = (select app.company_id()));

-- branches (scope 'company' sees all; 'branch'/'own' see assigned branches)
create policy branches_select on public.branches for select to authenticated
  using (
    company_id = (select app.company_id())
    and (
      (select app.permission_scope('org.branch.read')) = 'company'
      or ((select app.permission_scope('org.branch.read')) is not null and id = any (((select app.my_branch_ids()))::uuid[]))
    )
  );
create policy branches_insert on public.branches for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.branch.create')) = 'company');
create policy branches_update on public.branches for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.branch.update')) = 'company')
  with check (company_id = (select app.company_id()));
create policy branches_delete on public.branches for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.branch.delete')) = 'company');

-- memberships: everyone sees their own row; company scope sees the team
create policy memberships_select on public.memberships for select to authenticated
  using (
    company_id = (select app.company_id())
    and (
      (id = (select app.membership_id()) and (select app.is_active_member()))
      or (select app.permission_scope('org.member.read')) = 'company'
    )
  );
create policy memberships_update on public.memberships for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.member.update')) = 'company')
  with check (company_id = (select app.company_id()));

-- roles
create policy roles_select on public.roles for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.read')) is not null);
create policy roles_insert on public.roles for insert to authenticated
  with check (company_id = (select app.company_id()) and not is_system and (select app.permission_scope('org.role.manage')) = 'company');
create policy roles_update on public.roles for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company')
  with check (company_id = (select app.company_id()) and not is_system);
create policy roles_delete on public.roles for delete to authenticated
  using (company_id = (select app.company_id()) and not is_system and (select app.permission_scope('org.role.manage')) = 'company');

-- permission catalog: read-only for signed-in users
create policy permissions_select on public.permissions for select to authenticated
  using ((select auth.uid()) is not null);

-- membership_roles: own assignments, or all with org.role.read at company scope
create policy membership_roles_select on public.membership_roles for select to authenticated
  using (
    company_id = (select app.company_id())
    and (
      (membership_id = (select app.membership_id()) and (select app.is_active_member()))
      or (select app.permission_scope('org.role.read')) = 'company'
    )
  );
create policy membership_roles_insert on public.membership_roles for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company');
create policy membership_roles_delete on public.membership_roles for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company');

-- role_permissions
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.read')) is not null);
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company');
create policy role_permissions_update on public.role_permissions for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.role.manage')) = 'company');

-- company_settings
create policy company_settings_select on public.company_settings for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy company_settings_update on public.company_settings for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.settings.update')) = 'company')
  with check (company_id = (select app.company_id()));

-- company_currencies
create policy company_currencies_select on public.company_currencies for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy company_currencies_insert on public.company_currencies for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.currency.manage')) = 'company');
create policy company_currencies_update on public.company_currencies for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.currency.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy company_currencies_delete on public.company_currencies for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.currency.manage')) = 'company');

-- payment_terms
create policy payment_terms_select on public.payment_terms for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy payment_terms_insert on public.payment_terms for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.permission_scope('org.payment_term.manage')) = 'company');
create policy payment_terms_update on public.payment_terms for update to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.payment_term.manage')) = 'company')
  with check (company_id = (select app.company_id()));
create policy payment_terms_delete on public.payment_terms for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.payment_term.manage')) = 'company');

-- Grants (RLS still decides which rows). platform_admins and app.user_context get none.
grant select on public.companies, public.branches, public.memberships, public.roles, public.permissions,
  public.membership_roles, public.role_permissions, public.company_settings,
  public.company_currencies, public.payment_terms to authenticated;
grant update (name, name_local, country_code) on public.companies to authenticated;
grant insert, update (name, name_local, is_active), delete on public.branches to authenticated;
grant update (status, display_name) on public.memberships to authenticated;
grant insert (company_id, name, name_local), update (name, name_local), delete on public.roles to authenticated;
grant insert (company_id, membership_id, role_id, branch_id), delete on public.membership_roles to authenticated;
grant insert, update (data_scope), delete on public.role_permissions to authenticated;
grant update (cross_branch_stock_visibility, attendance_selfie_retention_days) on public.company_settings to authenticated;
grant insert, update (is_home), delete on public.company_currencies to authenticated;
grant insert, update (name, name_local, days), delete on public.payment_terms to authenticated;
revoke execute on function app.forbid_membership_user_change() from public, anon, authenticated;
