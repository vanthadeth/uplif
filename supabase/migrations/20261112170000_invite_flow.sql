-- Migration 28: the invite flow starts from an employee record.
-- Decided with Vantha, 2026-11-12:
--  * Every invitation is tied to an employee record (no employee, no invite). When it is accepted the employee is linked
--    to the new member, and the roles, branches and permission overrides the admin chose are applied.
--  * An invitation can carry several role+branch pairs, optional permission overrides, a note, and a lifetime of
--    1, 3, 7 or 14 days. Overrides only take effect when the invitation is accepted.
--  * "Resend" does not exist (links are stored hashed and cannot be shown again). "Get new link" revokes the old
--    invitation and creates a fresh one with the same settings; it keeps the seat.
--  * A link holder can see who the invite is for before signing in (company, employee name, position, roles,
--    branches, who invited them, the note) and why a link cannot be used. Nothing else.
-- Seat limits are unchanged (a pending invitation reserves a seat across the owner's companies).

alter table public.invitations
  add column employee_record_id uuid,
  add column roles jsonb not null default '[]'::jsonb,
  add column overrides jsonb not null default '[]'::jsonb,
  add column note text check (note is null or length(note) <= 300),
  add foreign key (company_id, employee_record_id) references public.employees (company_id, id) on delete cascade;
create index invitations_employee_idx on public.invitations (company_id, employee_record_id);
grant select (employee_record_id, roles, overrides, note) on public.invitations to authenticated;

-- The old open-ended function is replaced by one that needs an employee.
drop function public.create_invitation(uuid, uuid, text, text, text, date);

-- ---------- validation shared by create and replace ----------
-- Returns the cleaned roles (an array of {role_id, branch_id}) or raises.
create function app.clean_invite_roles(p_roles jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; rid uuid; bid uuid; out jsonb := '[]'::jsonb;
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' or jsonb_array_length(p_roles) not between 1 and 10 then
    raise exception 'choose between 1 and 10 roles' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_roles) loop
    rid := (r ->> 'role_id')::uuid;
    bid := nullif(r ->> 'branch_id', '')::uuid;
    if not exists (select 1 from public.roles where id = rid and company_id = app.company_id()) then
      raise exception 'role not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.roles where id = rid and company_id = app.company_id() and is_system and name = 'Owner') then
      raise exception 'owner cannot be invited' using errcode = 'P0001';
    end if;
    if bid is not null and not exists (select 1 from public.branches where id = bid and company_id = app.company_id()) then
      raise exception 'branch not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from jsonb_array_elements(out) x where x ->> 'role_id' = rid::text and coalesce(x ->> 'branch_id', '') = coalesce(bid::text, '')) then
      raise exception 'the same role and branch is listed twice' using errcode = 'P0001';
    end if;
    out := out || jsonb_build_array(jsonb_build_object('role_id', rid, 'branch_id', bid));
  end loop;
  return out;
end $$;

-- Overrides are checked with the same guards as set_permission_override: the caller manages roles at company
-- scope, never grants above their own access, a reason is required, the key must exist.
create function app.clean_invite_overrides(p_overrides jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o jsonb; k text; eff text; sc public.data_scope; mine public.data_scope; exp timestamptz; out jsonb := '[]'::jsonb;
begin
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'array' or jsonb_array_length(p_overrides) = 0 then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(p_overrides) > 30 then raise exception 'too many overrides' using errcode = 'P0001'; end if;
  if (select app.permission_scope('org.role.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for o in select * from jsonb_array_elements(p_overrides) loop
    k := o ->> 'permission_key';
    eff := o ->> 'effect';
    sc := nullif(o ->> 'data_scope', '')::public.data_scope;
    exp := nullif(o ->> 'expires_at', '')::timestamptz;
    if not exists (select 1 from public.permissions where key = k) then raise exception 'unknown permission' using errcode = 'P0002'; end if;
    if eff not in ('grant', 'deny') then raise exception 'effect must be grant or deny' using errcode = 'P0001'; end if;
    if nullif(btrim(o ->> 'reason'), '') is null then raise exception 'a reason is required' using errcode = 'P0001'; end if;
    if exp is not null and exp <= now() then raise exception 'expiry must be in the future' using errcode = 'P0001'; end if;
    if eff = 'grant' then
      if sc is null then raise exception 'a grant needs a scope' using errcode = 'P0001'; end if;
      mine := app.permission_scope(k);
      if mine is null or app.scope_rank(sc) > app.scope_rank(mine) then
        raise exception 'you cannot grant more than you have' using errcode = '42501';
      end if;
    elsif sc is not null then
      raise exception 'a deny has no scope' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements(out) x where x ->> 'permission_key' = k) then
      raise exception 'the same permission is listed twice' using errcode = 'P0001';
    end if;
    out := out || jsonb_build_array(jsonb_build_object('permission_key', k, 'effect', eff, 'data_scope', sc,
      'reason', btrim(o ->> 'reason'), 'expires_at', exp));
  end loop;
  return out;
end $$;
revoke all on function app.clean_invite_roles(jsonb), app.clean_invite_overrides(jsonb) from public, anon, authenticated;

-- ---------- create ----------
create function public.create_invite(
  p_employee_id uuid, p_roles jsonb, p_overrides jsonb default '[]'::jsonb, p_days integer default 7, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  emp public.employees;
  rs jsonb;
  ov jsonb;
  inv_id uuid;
  exp timestamptz;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null then p_days := 7; end if;
  if p_days not in (1, 3, 7, 14) then raise exception 'expiry must be 1, 3, 7 or 14 days' using errcode = 'P0001'; end if;
  select * into emp from public.employees where id = p_employee_id and company_id = app.company_id() for update;
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if emp.membership_id is not null then raise exception 'employee already has a sign-in' using errcode = 'P0001'; end if;
  if emp.status = 'left' then raise exception 'employee has left the company' using errcode = 'P0001'; end if;
  if exists (select 1 from public.invitations where company_id = emp.company_id and employee_record_id = emp.id
             and status = 'pending' and expires_at > now()) then
    raise exception 'employee already has a pending invitation' using errcode = 'P0001';
  end if;
  rs := app.clean_invite_roles(p_roles);
  ov := app.clean_invite_overrides(p_overrides);
  insert into public.invitations (company_id, token_hash, role_id, branch_id, label, created_by, employee_record_id, roles, overrides, note, expires_at)
    values (emp.company_id, app.invite_token_hash(tok), (rs -> 0 ->> 'role_id')::uuid, nullif(rs -> 0 ->> 'branch_id', '')::uuid,
            emp.name, app.membership_id(), emp.id, rs, ov, nullif(btrim(p_note), ''), now() + p_days * interval '1 day')
    returning id, expires_at into inv_id, exp;
  perform app.write_audit(app.company_id(), app.membership_id(), 'invitation.create', 'invitation', inv_id,
    jsonb_build_object('employee_id', emp.id, 'roles', rs, 'overrides', jsonb_array_length(ov), 'days', p_days));
  return jsonb_build_object('id', inv_id, 'token', tok, 'expires_at', exp);
end $$;

-- ---------- get a new link ----------
-- Revokes a pending (or expired) invitation and creates a fresh one with the same settings. The seat is kept: the old
-- invitation stops counting in the same transaction, then the new one reserves it again.
create function public.replace_invite(p_id uuid, p_days integer default 7) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  inv public.invitations;
  emp public.employees;
  new_id uuid;
  exp timestamptz;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null then p_days := 7; end if;
  if p_days not in (1, 3, 7, 14) then raise exception 'expiry must be 1, 3, 7 or 14 days' using errcode = 'P0001'; end if;
  select * into inv from public.invitations where id = p_id and company_id = app.company_id() and status = 'pending' for update;
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  if inv.employee_record_id is null then raise exception 'this invitation predates employee records; revoke it and invite again' using errcode = 'P0001'; end if;
  select * into emp from public.employees where id = inv.employee_record_id and company_id = inv.company_id for update;
  if emp.membership_id is not null or emp.status = 'left' then raise exception 'employee cannot be invited' using errcode = 'P0001'; end if;
  update public.invitations set status = 'revoked' where id = inv.id;
  insert into public.invitations (company_id, token_hash, role_id, branch_id, label, created_by, employee_record_id, roles, overrides, note, expires_at)
    values (inv.company_id, app.invite_token_hash(tok), inv.role_id, inv.branch_id, inv.label, app.membership_id(), inv.employee_record_id,
            inv.roles, inv.overrides, inv.note, now() + p_days * interval '1 day')
    returning id, expires_at into new_id, exp;
  perform app.write_audit(app.company_id(), app.membership_id(), 'invitation.replace', 'invitation', new_id,
    jsonb_build_object('replaces', inv.id, 'employee_id', inv.employee_record_id, 'days', p_days));
  return jsonb_build_object('id', new_id, 'token', tok, 'expires_at', exp);
end $$;

-- ---------- what a link holder may see ----------
-- Works before sign-in. The link is the secret (256 random bits), so holding it is enough to see who it is for.
-- A link that cannot be used says only why; the details appear only while it is pending.
drop function public.preview_invitation(text);
create function public.preview_invitation(p_token text) returns table (
  state text, company_name text, company_name_local text, employee_name text, employee_name_local text,
  position_name text, position_name_local text, access jsonb, invited_by text, note text, expires_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status::text end,
    c.name, c.name_local,
    case when i.status = 'pending' and i.expires_at > now() then coalesce(e.name, i.label) end,
    case when i.status = 'pending' and i.expires_at > now() then e.name_local end,
    case when i.status = 'pending' and i.expires_at > now() then p.name end,
    case when i.status = 'pending' and i.expires_at > now() then p.name_local end,
    case when i.status = 'pending' and i.expires_at > now() then
      (select coalesce(jsonb_agg(jsonb_build_object('role', r.name, 'role_local', r.name_local, 'branch', b.name, 'branch_local', b.name_local)), '[]'::jsonb)
       from jsonb_array_elements(case when jsonb_array_length(i.roles) > 0 then i.roles
              else jsonb_build_array(jsonb_build_object('role_id', i.role_id, 'branch_id', i.branch_id)) end) x
       join public.roles r on r.company_id = i.company_id and r.id = (x ->> 'role_id')::uuid
       left join public.branches b on b.company_id = i.company_id and b.id = nullif(x ->> 'branch_id', '')::uuid) end,
    case when i.status = 'pending' and i.expires_at > now() then m.display_name end,
    case when i.status = 'pending' and i.expires_at > now() then i.note end,
    case when i.status = 'pending' and i.expires_at > now() then i.expires_at end
  from public.invitations i
  join public.companies c on c.id = i.company_id
  left join public.employees e on e.company_id = i.company_id and e.id = i.employee_record_id
  left join public.positions p on p.company_id = i.company_id and p.id = e.position_id
  left join public.memberships m on m.company_id = i.company_id and m.id = i.created_by
  where i.token_hash = app.invite_token_hash(p_token)
$$;
revoke all on function public.preview_invitation(text) from public;
grant execute on function public.preview_invitation(text) to anon, authenticated;

-- ---------- accept ----------
-- A membership normally creates an employee record automatically; when the invitation names one, that record is
-- linked instead. The flag below tells the trigger to stand down for this one insert.
create or replace function app.employee_for_new_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  if current_setting('uplif.linking_employee', true) = 'on' then return new; end if;
  if exists (select 1 from public.employees where membership_id = new.id) then return new; end if;
  select id into pid from public.positions where company_id = new.company_id and lower(name) = lower(btrim(new.job_title));
  insert into public.employees (company_id, employee_no, name, position_id, employment_date, membership_id)
  values (new.company_id, new.employee_id, coalesce(nullif(btrim(new.display_name), ''), 'Unnamed'), pid, new.employment_date, new.id)
  on conflict do nothing;
  return new;
end $$;

create or replace function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.invitations;
  emp public.employees;
  mid uuid;
  r jsonb;
  o jsonb;
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

  if inv.employee_record_id is null then
    -- Invitations made before employee records existed keep their old behaviour.
    insert into public.memberships (company_id, user_id, display_name, employee_id, job_title, employment_date)
      values (inv.company_id, uid, (select full_name from public.profiles where user_id = uid),
              case when inv.employee_id is not null and not exists (
                     select 1 from public.memberships where company_id = inv.company_id and lower(employee_id) = lower(inv.employee_id))
                   then inv.employee_id end,
              inv.job_title, inv.employment_date)
      returning id into mid;
    insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
      values (inv.company_id, mid, inv.role_id, inv.branch_id);
  else
    select * into emp from public.employees where id = inv.employee_record_id and company_id = inv.company_id for update;
    if not found or emp.membership_id is not null or emp.status = 'left' then
      raise exception 'invitation invalid or expired' using errcode = 'P0002';
    end if;
    perform set_config('uplif.linking_employee', 'on', true);
    insert into public.memberships (company_id, user_id, display_name)
      values (inv.company_id, uid, emp.name) returning id into mid;
    perform set_config('uplif.linking_employee', 'off', true);
    update public.employees set membership_id = mid where id = emp.id;
    for r in select * from jsonb_array_elements(case when jsonb_array_length(inv.roles) > 0 then inv.roles
               else jsonb_build_array(jsonb_build_object('role_id', inv.role_id, 'branch_id', inv.branch_id)) end) loop
      insert into public.membership_roles (company_id, membership_id, role_id, branch_id)
        values (inv.company_id, mid, (r ->> 'role_id')::uuid, nullif(r ->> 'branch_id', '')::uuid)
        on conflict do nothing;
    end loop;
    for o in select * from jsonb_array_elements(inv.overrides) loop
      insert into public.membership_permission_overrides (company_id, membership_id, permission_key, effect, data_scope, reason, expires_at, created_by)
        values (inv.company_id, mid, o ->> 'permission_key', (o ->> 'effect')::public.override_effect,
                nullif(o ->> 'data_scope', '')::public.data_scope, o ->> 'reason', nullif(o ->> 'expires_at', '')::timestamptz, inv.created_by)
        on conflict (membership_id, permission_key) do nothing;
      perform app.write_audit(inv.company_id, inv.created_by, 'permission_override.set', 'membership', mid,
        jsonb_build_object('permission', o ->> 'permission_key', 'effect', o ->> 'effect', 'scope', o ->> 'data_scope',
                           'reason', o ->> 'reason', 'expires_at', o ->> 'expires_at', 'via', 'invitation'));
    end loop;
  end if;

  update public.invitations set status = 'accepted', accepted_by_user = uid, accepted_at = now() where id = inv.id;
  insert into app.user_context (user_id, active_membership_id) values (uid, mid)
    on conflict (user_id) do update set active_membership_id = excluded.active_membership_id;
  perform app.write_audit(inv.company_id, mid, 'invitation.accept', 'invitation', inv.id,
    jsonb_build_object('employee_id', inv.employee_record_id));
  return jsonb_build_object('company_id', inv.company_id, 'membership_id', mid);
end $$;

-- ---------- seats, as the invite panel needs them ----------
-- Real numbers from the plan, not hard-coded. Active members and pending invitations are counted across every company
-- the owner has. Only the owner account sees the per-company split and the plan; everyone else sees who to ask.
create function public.invite_seats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  owner uuid;
  pl public.plans;
  mine boolean;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('org.invitation.manage')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  owner := app.company_owner_user(cid);
  pl := app.company_plan(cid);
  mine := owner is not distinct from (select auth.uid());
  return jsonb_build_object(
    'max', pl.max_users,
    'active', (select count(*) from public.memberships m where m.status = 'active' and m.company_id in (select app.owned_company_ids(owner))),
    'pending', (select count(*) from public.invitations i where i.status = 'pending' and i.expires_at > now()
                and i.company_id in (select app.owned_company_ids(owner))),
    'is_owner', mine,
    'owner_name', (select p.full_name from public.profiles p where p.user_id = owner),
    'companies', case when mine then (
      select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'name_local', c.name_local,
        'count', (select count(*) from public.memberships m where m.status = 'active' and m.company_id = c.id)
               + (select count(*) from public.invitations i where i.status = 'pending' and i.expires_at > now() and i.company_id = c.id))
        order by c.name), '[]'::jsonb)
      from public.companies c where c.id in (select app.owned_company_ids(owner))) else null end);
end $$;

revoke all on function public.create_invite(uuid, jsonb, jsonb, integer, text), public.replace_invite(uuid, integer), public.invite_seats() from public, anon;
grant execute on function public.create_invite(uuid, jsonb, jsonb, integer, text), public.replace_invite(uuid, integer), public.invite_seats() to authenticated;
