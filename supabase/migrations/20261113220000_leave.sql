-- Leave requests (UPLIF Me > Record > Leave).
-- Rules (design 2026-11-12, defaults are company-changeable later):
--  * A company has leave types (code, name, paid or unpaid, yearly days or no limit). Defaults: Annual (AL, 18 days),
--    Sick (SL, 6 days), Unpaid (UL, no limit). Employees cannot change types.
--  * An active employee asks for leave for a date range, or half a day (first half "start" or second half "end").
--    Days are counted from the employee's own schedule: work days 1, half days 0.5, days off and holidays 0.
--  * A request is pending until someone with leave.request.review (by scope: team, branch or company) approves or
--    rejects it. Nobody approves their own request. Approved leave turns an absent day into a leave day.
--  * Types with yearly days block a request that would go over what is left. Pending requests count as taken, so two
--    pending requests cannot both claim the last days. Days are counted in the calendar year the leave starts.
--  * Two open requests (pending or approved) cannot overlap. An employee may cancel a pending request, or approved
--    leave that has not started.
--  * Nobody writes these tables directly; every change goes through the functions below and is audited.
-- Run migration 40 first.

insert into public.permissions (key, description, description_local) values
  ('leave.request.review', 'Approve or reject leave requests', 'អនុម័ត ឬបដិសេធសំណើច្បាប់'),
  ('leave.type.manage', 'Set the leave types and yearly days', 'កំណត់ប្រភេទច្បាប់ និងចំនួនថ្ងៃប្រចាំឆ្នាំ')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, 'company'
from public.roles ro cross join (values ('leave.request.review'), ('leave.type.manage')) as k(key)
where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'leave.request.review', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

-- New companies: Owner and Admin already receive every permission when roles are seeded. A new Manager role gets review for the team.
create function app.grant_manager_leave_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Manager' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'leave.request.review', 'team') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger grant_manager_leave_review after insert on public.roles for each row execute function app.grant_manager_leave_review();

-- ---------- tables ----------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code = upper(code) and length(code) between 1 and 4),
  name text not null check (length(btrim(name)) between 1 and 80),
  name_local text check (name_local is null or length(name_local) <= 80),
  paid boolean not null default true,
  annual_days numeric(5,1) check (annual_days is null or annual_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  type_id uuid not null,
  start_date date not null,
  end_date date not null,
  half text not null default 'full' check (half in ('full', 'start', 'end')),
  days numeric(4,1) not null check (days > 0),
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (half = 'full' or start_date = end_date),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, type_id) references public.leave_types (company_id, id),
  foreign key (company_id, decided_by) references public.memberships (company_id, id) on delete set null (decided_by)
);
create index leave_requests_employee_idx on public.leave_requests (company_id, employee_id, start_date);
create index leave_requests_status_idx on public.leave_requests (company_id, status, start_date);

create trigger touch_leave_types before update on public.leave_types for each row execute function app.touch_updated_at();
create trigger touch_leave_requests before update on public.leave_requests for each row execute function app.touch_updated_at();
create trigger immutable_company_leave_types before update on public.leave_types for each row execute function app.forbid_company_change();
create trigger immutable_company_leave_requests before update on public.leave_requests for each row execute function app.forbid_company_change();
create trigger audit_leave_types after insert or update or delete on public.leave_types for each row execute function app.audit_row();
create trigger audit_leave_requests after insert or update on public.leave_requests for each row execute function app.audit_row();

-- Default types for every company, now and later.
create function app.seed_leave_types(p_company_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.leave_types (company_id, code, name, name_local, paid, annual_days) values
    (p_company_id, 'AL', 'Annual leave', 'ច្បាប់ប្រចាំឆ្នាំ', true, 18),
    (p_company_id, 'SL', 'Sick leave', 'ច្បាប់ឈឺ', true, 6),
    (p_company_id, 'UL', 'Unpaid leave', 'ច្បាប់គ្មានប្រាក់ខែ', false, null)
  on conflict (company_id, code) do nothing;
$$;
revoke execute on function app.seed_leave_types(uuid) from public, anon, authenticated;
select app.seed_leave_types(id) from public.companies;
create function app.seed_leave_types_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_leave_types(new.id);
  return new;
end $$;
create trigger seed_leave_types after insert on public.companies for each row execute function app.seed_leave_types_trg();

-- ---------- who may review whom ----------
create function app.can_review_leave(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and p_employee_id is distinct from (select app.my_employee_id()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('leave.request.review')) is not null
      and (
        (select app.permission_scope('leave.request.review')) = 'company'
        or ((select app.permission_scope('leave.request.review')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('leave.request.review')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;
revoke all on function app.can_review_leave(uuid) from public, anon;
grant execute on function app.can_review_leave(uuid) to authenticated;

-- ---------- RLS: reviewers read; staff go through my_leave() ----------
alter table public.leave_types enable row level security;
alter table public.leave_types force row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_requests force row level security;
create policy leave_types_select on public.leave_types for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.can_review_leave(employee_id))));
grant select on public.leave_types, public.leave_requests to authenticated;

-- ---------- days counted from the employee's schedule ----------
create function app.leave_days(p_employee_id uuid, p_start date, p_end date, p_half text) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := p_start;
  total numeric := 0;
  k text;
begin
  while d <= p_end loop
    select w.day_kind into k from app.work_day(p_employee_id, d) w;
    if k = 'work' then total := total + case when p_half = 'full' then 1 else 0.5 end;
    elsif k = 'half' then total := total + 0.5;
    end if;
    d := d + 1;
  end loop;
  return total;
end $$;
revoke execute on function app.leave_days(uuid, date, date, text) from public, anon, authenticated;

-- Days of a type already taken or waiting in a calendar year, not counting one request.
create function app.leave_used(p_employee_id uuid, p_type_id uuid, p_year integer, p_except uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.days), 0) from public.leave_requests r
  where r.employee_id = p_employee_id and r.type_id = p_type_id and r.status in ('pending', 'approved')
    and extract(year from r.start_date) = p_year and r.id is distinct from p_except
$$;
revoke execute on function app.leave_used(uuid, uuid, integer, uuid) from public, anon, authenticated;

-- ---------- staff: ask, cancel, see ----------
create function public.request_leave(p_type_id uuid, p_start date, p_end date, p_half text, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  emp public.employees%rowtype;
  lt public.leave_types%rowtype;
  n numeric;
  new_id uuid;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into emp from public.employees where id = eid;
  if emp.status <> 'active' or not app.module_enabled(cid, 'attendance') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into lt from public.leave_types where id = p_type_id and company_id = cid and active;
  if not found then raise exception 'leave: type' using errcode = 'P0002'; end if;
  p_half := coalesce(p_half, 'full');
  if p_start is null or p_end is null or p_end < p_start or p_half not in ('full', 'start', 'end')
     or (p_half <> 'full' and p_start <> p_end) or p_start < current_date - 31 or p_end > current_date + 366 then
    raise exception 'leave: dates' using errcode = 'P0001';
  end if;
  n := app.leave_days(eid, p_start, p_end, p_half);
  if n <= 0 then raise exception 'leave: no working days' using errcode = 'P0001'; end if;
  if exists (select 1 from public.leave_requests r where r.employee_id = eid and r.status in ('pending', 'approved')
             and r.start_date <= p_end and r.end_date >= p_start) then
    raise exception 'leave: overlaps' using errcode = 'P0001';
  end if;
  if lt.annual_days is not null and app.leave_used(eid, lt.id, extract(year from p_start)::int, null) + n > lt.annual_days then
    raise exception 'leave: balance' using errcode = 'P0001';
  end if;
  insert into public.leave_requests (company_id, employee_id, type_id, start_date, end_date, half, days, reason)
  values (cid, eid, lt.id, p_start, p_end, p_half, n, nullif(btrim(coalesce(p_reason, '')), '')) returning leave_requests.id into new_id;
  return new_id;
end $$;

create function public.cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests%rowtype;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.leave_requests where id = p_id and company_id = app.company_id() and employee_id = app.my_employee_id();
  if not found then raise exception 'leave: not found' using errcode = 'P0002'; end if;
  if not (r.status = 'pending' or (r.status = 'approved' and r.start_date > current_date)) then
    raise exception 'leave: cannot cancel' using errcode = 'P0001';
  end if;
  update public.leave_requests set status = 'cancelled' where id = r.id;
end $$;

-- Balances for this year and every request from last year on.
create function public.my_leave() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  yr integer := extract(year from current_date)::int;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'year', yr,
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'name_local', t.name_local,
        'paid', t.paid, 'annual_days', t.annual_days,
        'used', (select coalesce(sum(r.days), 0) from public.leave_requests r where r.employee_id = eid and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = yr),
        'pending', (select coalesce(sum(r.days), 0) from public.leave_requests r where r.employee_id = eid and r.type_id = t.id and r.status = 'pending' and extract(year from r.start_date) = yr))
        order by t.code) from public.leave_types t where t.company_id = cid and t.active), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'type_id', r.type_id, 'code', t.code, 'name', t.name, 'name_local', t.name_local,
        'start_date', r.start_date, 'end_date', r.end_date, 'half', r.half, 'days', r.days, 'reason', r.reason, 'status', r.status,
        'decision_note', r.decision_note, 'created_at', r.created_at) order by r.start_date desc, r.created_at desc)
        from public.leave_requests r join public.leave_types t on t.id = r.type_id
        where r.employee_id = eid and r.company_id = cid and r.start_date >= make_date(yr - 1, 1, 1)), '[]'::jsonb));
end $$;

-- ---------- reviewers ----------
create function public.leave_review_list(p_status text default 'pending')
returns table (id uuid, employee_id uuid, employee_name text, employee_name_local text, type_code text, type_name text, type_name_local text,
               start_date date, end_date date, half text, days numeric, reason text, status text, decision_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('leave.request.review')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'rejected', 'cancelled') then raise exception 'status not allowed' using errcode = 'P0001'; end if;
  return query
  select r.id, r.employee_id, e.name, e.name_local, t.code, t.name, t.name_local, r.start_date, r.end_date, r.half, r.days, r.reason, r.status,
         r.decision_note, r.created_at
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id and e.company_id = r.company_id
  join public.leave_types t on t.id = r.type_id
  where r.company_id = app.company_id() and r.status = p_status and app.can_review_leave(r.employee_id)
  order by r.start_date, r.created_at
  limit 200;
end $$;

create function public.decide_leave(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests%rowtype;
  lt public.leave_types%rowtype;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.leave_requests where id = p_id and company_id = app.company_id() for update;
  if not found or not app.can_review_leave(r.employee_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'leave: already decided' using errcode = 'P0001'; end if;
  if coalesce(p_approve, false) then
    select * into lt from public.leave_types where id = r.type_id;
    if lt.annual_days is not null and app.leave_used(r.employee_id, r.type_id, extract(year from r.start_date)::int, r.id) + r.days > lt.annual_days then
      raise exception 'leave: balance' using errcode = 'P0001';
    end if;
  end if;
  update public.leave_requests set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
    decided_by = app.membership_id(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id;
end $$;

-- ---------- leave types: change the yearly days, names or pay; add or retire a type ----------
create function public.save_leave_type(p_id uuid, p_code text, p_name text, p_name_local text, p_paid boolean, p_annual_days numeric, p_active boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  tid uuid := p_id;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('leave.type.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if tid is null then
    insert into public.leave_types (company_id, code, name, name_local, paid, annual_days, active)
    values (cid, upper(btrim(p_code)), btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), coalesce(p_paid, true), p_annual_days, coalesce(p_active, true))
    returning id into tid;
  else
    update public.leave_types set name = btrim(p_name), name_local = nullif(btrim(coalesce(p_name_local, '')), ''),
      paid = coalesce(p_paid, paid), annual_days = p_annual_days, active = coalesce(p_active, active)
    where id = tid and company_id = cid;
    if not found then raise exception 'leave type not found' using errcode = 'P0002'; end if;
  end if;
  return tid;
end $$;

-- ---------- approved leave turns an absent, future or pending day into a leave day ----------
create or replace function public.employee_attendance_days(p_employee_id uuid, p_from date, p_days integer default 28)
returns table (day date, status text, first_in timestamptz, last_out timestamptz, late_min integer, early_min integer,
               worked_min integer, overtime_min integer, half_day boolean, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.can_read_attendance(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 62 then
    raise exception 'range not allowed' using errcode = 'P0001';
  end if;
  return query
    select d::date,
           case when r.status in ('absent', 'future', 'pending') and exists (
                  select 1 from public.leave_requests lr
                  where lr.employee_id = p_employee_id and lr.status = 'approved' and d::date between lr.start_date and lr.end_date)
                then 'leave' else r.status end,
           r.first_in, r.last_out, r.late_min, r.early_min, r.worked_min, r.overtime_min, r.half_day, r.flagged
    from generate_series(p_from::timestamp, (p_from + (p_days - 1))::timestamp, interval '1 day') d,
         lateral app.attendance_day(p_employee_id, d::date) r
    order by 1;
end $$;

revoke execute on function public.request_leave(uuid, date, date, text, text) from public, anon;
revoke execute on function public.cancel_leave(uuid) from public, anon;
revoke execute on function public.my_leave() from public, anon;
revoke execute on function public.leave_review_list(text) from public, anon;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
revoke execute on function public.save_leave_type(uuid, text, text, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.request_leave(uuid, date, date, text, text) to authenticated;
grant execute on function public.cancel_leave(uuid) to authenticated;
grant execute on function public.my_leave() to authenticated;
grant execute on function public.leave_review_list(text) to authenticated;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;
grant execute on function public.save_leave_type(uuid, text, text, text, boolean, numeric, boolean) to authenticated;
