-- Migration 14: creating a second company failed for users who already had one.
-- Cause: their token carries the first company's membership_id, so the Owner-role guards
-- ("the Owner role is fixed", "only an owner can change owners") fired while create_company seeded the
-- new company, and the audit triggers would have filed rows under the wrong membership.
-- Fix: create_company clears the membership claim for its own transaction (the first-company path).

create or replace function public.create_company(
  p_name text, p_name_local text, p_country_code text, p_home_currency text, p_branch_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cid uuid; mid uuid; bid uuid; owner_role uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- A user who already belongs to a company calls this with that company's membership in the token.
  -- Drop it for the rest of this call so the guard and audit triggers treat the new company's setup
  -- (roles, Owner assignment, branch) as system seeding, exactly as they do for a first company.
  perform set_config('request.jwt.claims',
    (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
       #- '{app_metadata,membership_id}' #- '{app_metadata,company_id}')::text, true);
  if not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'profile required' using errcode = 'P0001';
  end if;
  if (select count(*) from public.memberships where user_id = uid and status = 'active') >= 5 then
    raise exception 'company limit reached' using errcode = 'P0001';
  end if;

  insert into public.companies (name, name_local, country_code)
    values (btrim(p_name), nullif(btrim(p_name_local), ''), upper(p_country_code)) returning id into cid;
  insert into public.company_settings (company_id) values (cid);
  insert into public.company_currencies (company_id, code, is_home) values (cid, upper(p_home_currency), true);
  insert into public.branches (company_id, name) values (cid, coalesce(nullif(btrim(p_branch_name), ''), 'Main'))
    returning id into bid;
  owner_role := app.seed_system_roles(cid);
  insert into public.memberships (company_id, user_id, display_name)
    values (cid, uid, (select full_name from public.profiles where user_id = uid)) returning id into mid;
  insert into public.membership_roles (company_id, membership_id, role_id) values (cid, mid, owner_role);
  insert into app.user_context (user_id, active_membership_id) values (uid, mid)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
  perform app.write_audit(cid, mid, 'company.create', 'company', cid, jsonb_build_object('name', p_name));
  return jsonb_build_object('company_id', cid, 'membership_id', mid, 'branch_id', bid);
end $$;
