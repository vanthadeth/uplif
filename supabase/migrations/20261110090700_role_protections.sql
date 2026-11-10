-- Migration 8: protections and audit for roles, permissions and role assignments.
-- Rules: the Owner role's permissions are fixed; only an Owner can grant or remove Owner;
-- a company always keeps one active Owner; a role with members cannot be deleted.
-- Writes without a membership claim (seeding, admin tooling) are not blocked here.

create function app.protect_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid uuid; cid uuid;
begin
  if tg_op = 'DELETE' then rid := old.role_id; cid := old.company_id; else rid := new.role_id; cid := new.company_id; end if;
  if app.membership_id() is not null and exists (
    select 1 from public.roles where company_id = cid and id = rid and is_system and name = 'Owner') then
    raise exception 'the Owner role is fixed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create function app.protect_owner_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.membership_roles;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if app.membership_id() is null
     or not exists (select 1 from public.roles where company_id = r.company_id and id = r.role_id and is_system and name = 'Owner') then
    return r;
  end if;
  if not exists (select 1 from public.membership_roles mr join public.roles ro on ro.company_id = mr.company_id and ro.id = mr.role_id
                 where mr.membership_id = app.membership_id() and mr.company_id = r.company_id and ro.is_system and ro.name = 'Owner') then
    raise exception 'only an owner can change owners' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and not exists (
      select 1 from public.membership_roles mr
      join public.roles ro on ro.company_id = mr.company_id and ro.id = mr.role_id
      join public.memberships m on m.company_id = mr.company_id and m.id = mr.membership_id
      where mr.company_id = r.company_id and mr.id <> r.id and ro.is_system and ro.name = 'Owner' and m.status = 'active') then
    raise exception 'a company needs at least one active owner' using errcode = 'P0001';
  end if;
  return r;
end $$;

create function app.protect_role_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.membership_id() is not null and exists (
    select 1 from public.membership_roles where company_id = old.company_id and role_id = old.id) then
    raise exception 'role is still assigned to people' using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger protect_role_permissions before insert or update or delete on public.role_permissions
  for each row execute function app.protect_role_permissions();
create trigger protect_owner_assignment before insert or delete on public.membership_roles
  for each row execute function app.protect_owner_assignment();
create trigger protect_role_delete before delete on public.roles
  for each row execute function app.protect_role_delete();

create trigger audit_roles after insert or update or delete on public.roles for each row execute function app.audit_row();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function app.audit_row();
create trigger audit_membership_roles after insert or delete on public.membership_roles for each row execute function app.audit_row();

revoke all on function app.protect_role_permissions(), app.protect_owner_assignment(), app.protect_role_delete()
  from public, anon, authenticated;
