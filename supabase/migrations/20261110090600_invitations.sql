-- Migration 7: invitations (single-use link token, 7 days), member protections and audit.
-- Tokens are random, shown once and stored only as a SHA-256 hash.
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  token_hash bytea not null unique,
  role_id uuid not null,
  branch_id uuid,
  label text,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null,
  accepted_by_user uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, role_id) references public.roles (company_id, id) on delete cascade,
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete cascade,
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete cascade
);
create index invitations_company_idx on public.invitations (company_id, status);
alter table public.invitations enable row level security;
alter table public.invitations force row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (company_id = (select app.company_id()) and (select app.permission_scope('org.invitation.manage')) = 'company');
grant select (id, company_id, role_id, branch_id, label, status, expires_at, created_by, accepted_at, created_at)
  on public.invitations to authenticated;

create function app.invite_token_hash(p_token text) returns bytea
language sql immutable set search_path = '' as $$ select sha256(convert_to(p_token, 'utf8')) $$;

create function public.create_invitation(p_role_id uuid, p_branch_id uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  inv_id uuid;
  exp timestamptz;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.roles where id = p_role_id and company_id = app.company_id() and is_system and name = 'Owner') then
    raise exception 'owner cannot be invited' using errcode = 'P0001';
  end if;
  insert into public.invitations (company_id, token_hash, role_id, branch_id, label, created_by)
    values (app.company_id(), app.invite_token_hash(tok), p_role_id, p_branch_id, nullif(btrim(p_label), ''), app.membership_id())
    returning id, expires_at into inv_id, exp;
  perform app.write_audit(app.company_id(), app.membership_id(), 'invitation.create', 'invitation', inv_id,
    jsonb_build_object('role_id', p_role_id, 'branch_id', p_branch_id));
  return jsonb_build_object('id', inv_id, 'token', tok, 'expires_at', exp);
end $$;

create function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked'
    where id = p_id and company_id = app.company_id() and status = 'pending';
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  perform app.write_audit(app.company_id(), app.membership_id(), 'invitation.revoke', 'invitation', p_id, '{}'::jsonb);
end $$;

-- What a link holder may see before accepting: the company and role, nothing else.
create function public.preview_invitation(p_token text) returns table (
  company_name text, company_name_local text, role_name text, expires_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.name, c.name_local, r.name, i.expires_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  join public.roles r on r.company_id = i.company_id and r.id = i.role_id
  where (select auth.uid()) is not null
    and i.token_hash = app.invite_token_hash(p_token)
    and i.status = 'pending' and i.expires_at > now()
$$;

create function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.invitations;
  mid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'profile required' using errcode = 'P0001';
  end if;
  select * into inv from public.invitations
    where token_hash = app.invite_token_hash(p_token) and status = 'pending' and expires_at > now()
    for update;
  if not found then raise exception 'invitation invalid or expired' using errcode = 'P0002'; end if;
  if exists (select 1 from public.memberships where company_id = inv.company_id and user_id = uid) then
    raise exception 'already a member' using errcode = 'P0001';
  end if;
  insert into public.memberships (company_id, user_id, display_name)
    values (inv.company_id, uid, (select full_name from public.profiles where user_id = uid)) returning id into mid;
  insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
    values (inv.company_id, mid, inv.role_id, inv.branch_id);
  update public.invitations set status = 'accepted', accepted_by_user = uid, accepted_at = now() where id = inv.id;
  insert into app.user_context (user_id, active_membership_id) values (uid, mid)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
  perform app.write_audit(inv.company_id, mid, 'invitation.accept', 'invitation', inv.id, '{}'::jsonb);
  return jsonb_build_object('company_id', inv.company_id, 'membership_id', mid);
end $$;

-- Members cannot suspend themselves, and a company always keeps one active Owner.
create function app.protect_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if old.id = app.membership_id() then
      raise exception 'you cannot change your own status' using errcode = '42501';
    end if;
    if old.status = 'active' and new.status <> 'active'
       and exists (select 1 from public.membership_roles mr join public.roles r on r.company_id = mr.company_id and r.id = mr.role_id
                   where mr.membership_id = old.id and r.is_system and r.name = 'Owner')
       and not exists (select 1 from public.memberships m
                       join public.membership_roles mr on mr.company_id = m.company_id and mr.membership_id = m.id
                       join public.roles r on r.company_id = mr.company_id and r.id = mr.role_id
                       where m.company_id = old.company_id and m.id <> old.id and m.status = 'active'
                         and r.is_system and r.name = 'Owner') then
      raise exception 'a company needs at least one active owner' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger protect_memberships before update on public.memberships
  for each row execute function app.protect_membership_change();
create trigger audit_memberships after update on public.memberships for each row execute function app.audit_row();

revoke all on function app.invite_token_hash(text), app.protect_membership_change() from public, anon, authenticated;
revoke all on function public.create_invitation(uuid, uuid, text), public.revoke_invitation(uuid),
  public.preview_invitation(text), public.accept_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid, uuid, text), public.revoke_invitation(uuid),
  public.preview_invitation(text), public.accept_invitation(text) to authenticated;
