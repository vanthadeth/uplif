-- UPLIF Time, slice T2: leave allowances.
-- A company may give one person more (or fewer) leave days of a type in a year, for example +1 day for each 3 years of service.
--  * leave_allowances is append-only: a row is never changed or deleted, a mistake is corrected with a new row of the opposite sign.
--  * What a person may take in a year = the type's annual_days + the sum of their allowances for that type and year (app.leave_entitled).
--    request_leave, decide_leave and my_leave use it, so UPLIF Me shows the same number. Types without a limit take no allowance.
--  * leave.allowance.manage (company scope, Owner and Admin) gives days; reviewers read balances for the people they review.
-- Run the leave migration first.
insert into public.permissions (key, description, description_local) values
  ('leave.allowance.manage', 'Give or take away leave days for a person', 'ផ្តល់ ឬកាត់ថ្ងៃច្បាប់សម្រាប់បុគ្គលិក')
on conflict (key) do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'leave.allowance.manage', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;

create table public.leave_allowances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  type_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  days numeric(5,1) not null check (days <> 0 and days between -366 and 366),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, type_id) references public.leave_types (company_id, id),
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by)
);
create index leave_allowances_employee_idx on public.leave_allowances (company_id, employee_id, type_id, year);

create function app.leave_allowances_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'leave_allowances is append-only' using errcode = '42501';
end $$;
create trigger leave_allowances_no_update before update on public.leave_allowances for each row execute function app.leave_allowances_append_only();
create trigger leave_allowances_no_delete before delete on public.leave_allowances for each row execute function app.leave_allowances_append_only();
create trigger audit_leave_allowances after insert on public.leave_allowances for each row execute function app.audit_row();

alter table public.leave_allowances enable row level security;
alter table public.leave_allowances force row level security;
create policy leave_allowances_select on public.leave_allowances for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.can_review_leave(employee_id))));
grant select on public.leave_allowances to authenticated;

-- Days one person may take of one type in a year; null when the type has no limit.
create function app.leave_entitled(p_employee_id uuid, p_type_id uuid, p_year integer) returns numeric
language sql stable security definer set search_path = '' as $$
  select t.annual_days + coalesce((select sum(a.days) from public.leave_allowances a
    where a.employee_id = p_employee_id and a.type_id = p_type_id and a.year = p_year), 0)
  from public.leave_types t where t.id = p_type_id
$$;
revoke execute on function app.leave_entitled(uuid, uuid, integer) from public, anon, authenticated;

create function public.grant_leave_allowance(p_employee_id uuid, p_type_id uuid, p_year integer, p_days numeric, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  lt public.leave_types%rowtype;
  new_id uuid;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('leave.allowance.manage')) is distinct from 'company'
     or not app.module_enabled(cid, 'attendance') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = cid) then
    raise exception 'leave: not found' using errcode = 'P0002';
  end if;
  select * into lt from public.leave_types where id = p_type_id and company_id = cid and active;
  if not found then raise exception 'leave: type' using errcode = 'P0002'; end if;
  if lt.annual_days is null then raise exception 'leave: unlimited' using errcode = 'P0001'; end if;
  if p_year is null or p_year not between 2000 and 2100 or p_days is null or p_days = 0 or abs(p_days) > 366
     or length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'leave: allowance' using errcode = 'P0001';
  end if;
  if lt.annual_days + coalesce((select sum(a.days) from public.leave_allowances a where a.employee_id = p_employee_id and a.type_id = p_type_id and a.year = p_year), 0) + p_days < 0 then
    raise exception 'leave: allowance' using errcode = 'P0001';
  end if;
  insert into public.leave_allowances (company_id, employee_id, type_id, year, days, reason, created_by)
  values (cid, p_employee_id, p_type_id, p_year, round(p_days, 1), btrim(p_reason), app.membership_id()) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.grant_leave_allowance(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.grant_leave_allowance(uuid, uuid, integer, numeric, text) to authenticated;

-- One row per person and limited leave type for a year, for the people the caller reviews.
create function public.time_leave_balances(p_year integer default null)
returns table (employee_id uuid, name text, name_local text, type_id uuid, type_code text, type_name text, type_name_local text,
               entitled numeric, allowance numeric, used numeric, pending numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  yr integer := coalesce(p_year, extract(year from current_date)::int);
begin
  if not (select app.is_active_member()) or (select app.permission_scope('leave.request.review')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not app.module_enabled(cid, 'attendance') then raise exception 'module not in plan: attendance' using errcode = 'P0001'; end if;
  return query
  select e.id, e.name, e.name_local, t.id, t.code, t.name, t.name_local,
         app.leave_entitled(e.id, t.id, yr),
         coalesce((select sum(a.days) from public.leave_allowances a where a.employee_id = e.id and a.type_id = t.id and a.year = yr), 0),
         coalesce((select sum(r.days) from public.leave_requests r where r.employee_id = e.id and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = yr), 0),
         coalesce((select sum(r.days) from public.leave_requests r where r.employee_id = e.id and r.type_id = t.id and r.status = 'pending' and extract(year from r.start_date) = yr), 0)
  from public.employees e
  cross join public.leave_types t
  where e.company_id = cid and e.status = 'active' and t.company_id = cid and t.active and t.annual_days is not null
    and app.can_review_leave(e.id)
  order by e.name, t.code
  limit 2000;
end $$;
revoke all on function public.time_leave_balances(integer) from public, anon;
grant execute on function public.time_leave_balances(integer) to authenticated;

-- ---------- the three leave functions now use what the person is entitled to ----------
create or replace function public.request_leave(p_type_id uuid, p_start date, p_end date, p_half text, p_reason text)
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
  if lt.annual_days is not null and app.leave_used(eid, lt.id, extract(year from p_start)::int, null) + n > app.leave_entitled(eid, lt.id, extract(year from p_start)::int) then
    raise exception 'leave: balance' using errcode = 'P0001';
  end if;
  insert into public.leave_requests (company_id, employee_id, type_id, start_date, end_date, half, days, reason)
  values (cid, eid, lt.id, p_start, p_end, p_half, n, nullif(btrim(coalesce(p_reason, '')), '')) returning leave_requests.id into new_id;
  return new_id;
end $$;

create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text) returns void
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
    if lt.annual_days is not null and app.leave_used(r.employee_id, r.type_id, extract(year from r.start_date)::int, r.id) + r.days > app.leave_entitled(r.employee_id, r.type_id, extract(year from r.start_date)::int) then
      raise exception 'leave: balance' using errcode = 'P0001';
    end if;
  end if;
  update public.leave_requests set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
    decided_by = app.membership_id(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id;
end $$;

create or replace function public.my_leave() returns jsonb
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
        'paid', t.paid, 'annual_days', app.leave_entitled(eid, t.id, yr),
        'used', (select coalesce(sum(r.days), 0) from public.leave_requests r where r.employee_id = eid and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = yr),
        'pending', (select coalesce(sum(r.days), 0) from public.leave_requests r where r.employee_id = eid and r.type_id = t.id and r.status = 'pending' and extract(year from r.start_date) = yr))
        order by t.code) from public.leave_types t where t.company_id = cid and t.active), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'type_id', r.type_id, 'code', t.code, 'name', t.name, 'name_local', t.name_local,
        'start_date', r.start_date, 'end_date', r.end_date, 'half', r.half, 'days', r.days, 'reason', r.reason, 'status', r.status,
        'decision_note', r.decision_note, 'created_at', r.created_at) order by r.start_date desc, r.created_at desc)
        from public.leave_requests r join public.leave_types t on t.id = r.type_id
        where r.employee_id = eid and r.company_id = cid and r.start_date >= make_date(yr - 1, 1, 1)), '[]'::jsonb));
end $$;
