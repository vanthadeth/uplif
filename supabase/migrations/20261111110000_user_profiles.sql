-- Migration 14: company record vs personal profile.
-- Company record (managed by admins): employee_id, job_title, employment_date on memberships and invitations.
-- Personal profile (owned by the person): extra columns on profiles, up to three phone numbers, a per-company
-- sharing switch table, and a private picture bucket. Admins read another person's profile only through
-- public.get_member_profile(), which checks the company and the permission and returns shared groups only.

-- ---------- company record ----------
alter table public.memberships
  add column employee_id text check (employee_id is null or length(btrim(employee_id)) between 1 and 40),
  add column job_title text check (job_title is null or length(btrim(job_title)) between 1 and 80),
  add column employment_date date;
create unique index memberships_employee_id_key on public.memberships (company_id, lower(employee_id)) where employee_id is not null;
grant update (employee_id, job_title, employment_date) on public.memberships to authenticated;

alter table public.invitations
  add column employee_id text check (employee_id is null or length(btrim(employee_id)) between 1 and 40),
  add column job_title text check (job_title is null or length(btrim(job_title)) between 1 and 80),
  add column employment_date date;
grant select (employee_id, job_title, employment_date) on public.invitations to authenticated;

-- An employee ID is unique among members and pending invitations of one company.
drop function public.create_invitation(uuid, uuid, text);
create function public.create_invitation(
  p_role_id uuid, p_branch_id uuid, p_label text,
  p_employee_id text default null, p_job_title text default null, p_employment_date date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  inv_id uuid;
  exp timestamptz;
  eid text := nullif(btrim(p_employee_id), '');
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.roles where id = p_role_id and company_id = app.company_id() and is_system and name = 'Owner') then
    raise exception 'owner cannot be invited' using errcode = 'P0001';
  end if;
  if eid is not null and (
       exists (select 1 from public.memberships where company_id = app.company_id() and lower(employee_id) = lower(eid))
    or exists (select 1 from public.invitations where company_id = app.company_id() and status = 'pending' and expires_at > now() and lower(employee_id) = lower(eid))) then
    raise exception 'employee id already used' using errcode = '23505';
  end if;
  insert into public.invitations (company_id, token_hash, role_id, branch_id, label, created_by, employee_id, job_title, employment_date)
    values (app.company_id(), app.invite_token_hash(tok), p_role_id, p_branch_id, nullif(btrim(p_label), ''), app.membership_id(),
            eid, nullif(btrim(p_job_title), ''), p_employment_date)
    returning id, expires_at into inv_id, exp;
  perform app.write_audit(app.company_id(), app.membership_id(), 'invitation.create', 'invitation', inv_id,
    jsonb_build_object('role_id', p_role_id, 'branch_id', p_branch_id));
  return jsonb_build_object('id', inv_id, 'token', tok, 'expires_at', exp);
end $$;
revoke all on function public.create_invitation(uuid, uuid, text, text, text, date) from public, anon;
grant execute on function public.create_invitation(uuid, uuid, text, text, text, date) to authenticated;

-- Accepting copies the company record. If the employee ID was taken in the meantime it is left empty, not an error.
create or replace function public.accept_invitation(p_token text) returns jsonb
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
  insert into public.memberships (company_id, user_id, display_name, employee_id, job_title, employment_date)
    values (inv.company_id, uid, (select full_name from public.profiles where user_id = uid),
            case when inv.employee_id is not null and not exists (
                   select 1 from public.memberships where company_id = inv.company_id and lower(employee_id) = lower(inv.employee_id))
                 then inv.employee_id end,
            inv.job_title, inv.employment_date)
    returning id into mid;
  insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
    values (inv.company_id, mid, inv.role_id, inv.branch_id);
  update public.invitations set status = 'accepted', accepted_by_user = uid, accepted_at = now() where id = inv.id;
  insert into app.user_context (user_id, active_membership_id) values (uid, mid)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
  perform app.write_audit(inv.company_id, mid, 'invitation.accept', 'invitation', inv.id, '{}'::jsonb);
  return jsonb_build_object('company_id', inv.company_id, 'membership_id', mid);
end $$;

-- ---------- personal profile ----------
alter table public.profiles
  add column gender text check (gender in ('F', 'M', 'O')),
  add column date_of_birth date check (date_of_birth <= current_date),
  add column picture_path text check (picture_path is null or length(picture_path) <= 300),
  add column address_line1 text check (length(address_line1) <= 200),
  add column address_line2 text check (length(address_line2) <= 200),
  add column emergency_name text check (length(emergency_name) <= 120),
  add column emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9 ()-]{6,20}$');
grant update (gender, date_of_birth, picture_path, address_line1, address_line2, emergency_name, emergency_phone)
  on public.profiles to authenticated;

create table public.profile_phones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (label in ('mobile', 'home', 'work')),
  number text not null check (number ~ '^\+?[0-9 ()-]{6,20}$'),
  created_at timestamptz not null default now()
);
create index profile_phones_user_idx on public.profile_phones (user_id);
alter table public.profile_phones enable row level security;
alter table public.profile_phones force row level security;
create policy profile_phones_own on public.profile_phones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.profile_phones to authenticated;
grant insert (user_id, label, number), update (label, number) on public.profile_phones to authenticated;

create function app.limit_profile_phones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where user_id = new.user_id for update;
  if (select count(*) from public.profile_phones where user_id = new.user_id) >= 3 then
    raise exception 'at most three phone numbers' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger profile_phones_max before insert on public.profile_phones
  for each row execute function app.limit_profile_phones();
revoke all on function app.limit_profile_phones() from public, anon, authenticated;

-- Per-company sharing: private unless the person switches a group on for that company.
create table public.membership_sharing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  membership_id uuid not null,
  share_phones boolean not null default false,
  share_address boolean not null default false,
  share_birth_date boolean not null default false,
  share_gender boolean not null default false,
  share_emergency boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (membership_id),
  foreign key (company_id, membership_id) references public.memberships (company_id, id) on delete cascade
);
create trigger touch_membership_sharing before update on public.membership_sharing
  for each row execute function app.touch_updated_at();
alter table public.membership_sharing enable row level security;
alter table public.membership_sharing force row level security;
create policy sharing_own on public.membership_sharing for all to authenticated
  using (company_id = (select app.company_id()) and membership_id = (select app.membership_id()) and (select app.is_active_member()))
  with check (company_id = (select app.company_id()) and membership_id = (select app.membership_id()) and (select app.is_active_member()));
grant select on public.membership_sharing to authenticated;
grant insert (company_id, membership_id, share_phones, share_address, share_birth_date, share_gender, share_emergency),
      update (share_phones, share_address, share_birth_date, share_gender, share_emergency)
  on public.membership_sharing to authenticated;
create trigger audit_membership_sharing after insert or update on public.membership_sharing
  for each row execute function app.audit_row();

-- The only way an admin reads another person's profile.
create function public.get_member_profile(p_membership_id uuid) returns table (
  membership_id uuid, full_name text, full_name_local text, picture_path text,
  shared_phones boolean, shared_address boolean, shared_birth_date boolean, shared_gender boolean, shared_emergency boolean,
  phones jsonb, address_line1 text, address_line2 text, date_of_birth date, gender text, emergency_name text, emergency_phone text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  m public.memberships;
  s public.membership_sharing;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.member.read')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into m from public.memberships where id = p_membership_id and company_id = app.company_id();
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  select * into s from public.membership_sharing where membership_sharing.membership_id = m.id;
  return query
  select m.id, p.full_name, p.full_name_local, p.picture_path,
    coalesce(s.share_phones, false), coalesce(s.share_address, false), coalesce(s.share_birth_date, false),
    coalesce(s.share_gender, false), coalesce(s.share_emergency, false),
    case when coalesce(s.share_phones, false)
         then (select coalesce(jsonb_agg(jsonb_build_object('label', ph.label, 'number', ph.number) order by ph.created_at), '[]'::jsonb)
               from public.profile_phones ph where ph.user_id = m.user_id) end,
    case when coalesce(s.share_address, false) then p.address_line1 end,
    case when coalesce(s.share_address, false) then p.address_line2 end,
    case when coalesce(s.share_birth_date, false) then p.date_of_birth end,
    case when coalesce(s.share_gender, false) then p.gender end,
    case when coalesce(s.share_emergency, false) then p.emergency_name end,
    case when coalesce(s.share_emergency, false) then p.emergency_phone end
  from public.profiles p where p.user_id = m.user_id;
end $$;
revoke all on function public.get_member_profile(uuid) from public, anon;
grant execute on function public.get_member_profile(uuid) to authenticated;

-- ---------- private picture bucket ----------
-- One folder per person: <user id>/<file>. Anyone active in the same company can see a colleague's picture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-pictures', 'profile-pictures', false, 2097152, array['image/jpeg', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png'];

create function app.can_see_picture(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member() and exists (
    select 1 from public.memberships m
    where m.company_id = app.company_id() and m.status = 'active' and m.user_id::text = p_folder)
$$;
revoke all on function app.can_see_picture(text) from public, anon;
grant execute on function app.can_see_picture(text) to authenticated;

create policy profile_pictures_select on storage.objects for select to authenticated
  using (bucket_id = 'profile-pictures'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or app.can_see_picture((storage.foldername(name))[1])));
create policy profile_pictures_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_pictures_update on storage.objects for update to authenticated
  using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_pictures_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
