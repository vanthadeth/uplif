-- Attendance corrections (UPLIF Me > Record > Attendance, console > Corrections).
-- Rules (design 2026-11-12):
--  * An active employee asks to fix a day they forgot to clock, or clocked wrongly: the date, the clock-in time and/or the
--    clock-out time that should count, and a reason. Dates are today or up to 31 days back; one open request per day.
--  * Times are in the branch's time zone (else the company's, else Asia/Phnom_Penh). A time before the day start hour
--    (default 04:00) belongs to the next calendar day, so a late shift ending after midnight stays on its own day.
--  * Someone with attendance.amendment.review (by scope: Owner/Admin company, Manager team) approves or rejects. Nobody
--    approves their own request.
--  * Approving adds the requested clock events to the day, marked "amended" so they show as flagged. Nothing is deleted
--    or rewritten: the earliest clock-in and the last clock-out of the day still decide the result, so a correction can
--    only add a missing event or move one earlier (in) or later (out).
--  * An employee may cancel a pending request. Nobody writes these tables directly; every change goes through functions.
-- Run the attendance migrations first.

insert into public.permissions (key, description, description_local) values
  ('attendance.amendment.review', 'Approve or reject attendance corrections', 'អនុម័ត ឬបដិសេធការកែតម្រូវវត្តមាន')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.amendment.review', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'attendance.amendment.review', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

create function app.grant_manager_amendment_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Manager' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'attendance.amendment.review', 'team') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger grant_manager_amendment_review after insert on public.roles for each row execute function app.grant_manager_amendment_review();

create table public.attendance_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  in_time time,
  out_time time,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (in_time is not null or out_time is not null),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, decided_by) references public.memberships (company_id, id) on delete set null (decided_by)
);
create unique index attendance_amendments_one_open_idx on public.attendance_amendments (employee_id, work_date) where status = 'pending';
create index attendance_amendments_company_idx on public.attendance_amendments (company_id, status, work_date);

create trigger touch_attendance_amendments before update on public.attendance_amendments for each row execute function app.touch_updated_at();
create trigger immutable_company_attendance_amendments before update on public.attendance_amendments for each row execute function app.forbid_company_change();
create trigger audit_attendance_amendments after insert or update on public.attendance_amendments for each row execute function app.audit_row();

create function app.can_review_amendment(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and p_employee_id is distinct from (select app.my_employee_id()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('attendance.amendment.review')) is not null
      and (
        (select app.permission_scope('attendance.amendment.review')) = 'company'
        or ((select app.permission_scope('attendance.amendment.review')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('attendance.amendment.review')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;
revoke all on function app.can_review_amendment(uuid) from public, anon;
grant execute on function app.can_review_amendment(uuid) to authenticated;

alter table public.attendance_amendments enable row level security;
alter table public.attendance_amendments force row level security;
create policy attendance_amendments_select on public.attendance_amendments for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.can_review_amendment(employee_id))));
grant select on public.attendance_amendments to authenticated;

-- The moment a clock time on a work date means, in the employee's time zone.
create function app.amendment_moment(p_employee_id uuid, p_date date, p_time time) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees%rowtype;
  tz text;
  start_h integer;
  d date := p_date;
begin
  select * into e from public.employees where id = p_employee_id;
  tz := coalesce((select b.timezone from public.branches b where b.company_id = e.company_id and b.id = e.branch_id),
                 (select cs.timezone from public.company_settings cs where cs.company_id = e.company_id), 'Asia/Phnom_Penh');
  start_h := coalesce((select s.day_start_hour from public.attendance_settings s where s.company_id = e.company_id), 4);
  if extract(hour from p_time) < start_h then d := d + 1; end if;
  return (d::timestamp + p_time) at time zone tz;
end $$;
revoke execute on function app.amendment_moment(uuid, date, time) from public, anon, authenticated;

-- ---------- staff ----------
create function public.request_amendment(p_date date, p_in time, p_out time, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  new_id uuid;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = eid and status = 'active') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_date is null or p_date > current_date or p_date < current_date - 31 then raise exception 'date not allowed' using errcode = '22023'; end if;
  if p_in is null and p_out is null then raise exception 'a time is required' using errcode = '22023'; end if;
  if p_in is not null and p_out is not null and app.amendment_moment(eid, p_date, p_out) <= app.amendment_moment(eid, p_date, p_in) then
    raise exception 'out must be after in' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.attendance_amendments where employee_id = eid and work_date = p_date and status = 'pending') then
    raise exception 'amendment: already open' using errcode = 'P0001';
  end if;
  insert into public.attendance_amendments (company_id, employee_id, work_date, in_time, out_time, reason)
  values (cid, eid, p_date, p_in, p_out, btrim(p_reason)) returning id into new_id;
  return new_id;
end $$;

create function public.cancel_amendment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.attendance_amendments set status = 'cancelled'
  where id = p_id and company_id = app.company_id() and employee_id = app.my_employee_id() and status = 'pending';
  if not found then raise exception 'amendment: cannot cancel' using errcode = 'P0001'; end if;
end $$;

create function public.my_amendments()
returns table (id uuid, work_date date, in_time time, out_time time, reason text, status text, decision_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select a.id, a.work_date, a.in_time, a.out_time, a.reason, a.status, a.decision_note, a.created_at
  from public.attendance_amendments a where a.employee_id = eid and a.company_id = app.company_id()
  order by a.created_at desc limit 30;
end $$;

-- ---------- reviewers ----------
create function public.amendment_review_list(p_status text default 'pending')
returns table (id uuid, employee_id uuid, employee_name text, employee_name_local text, work_date date, in_time time, out_time time,
               reason text, status text, decision_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('attendance.amendment.review')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'rejected', 'cancelled') then raise exception 'status not allowed' using errcode = 'P0001'; end if;
  return query
  select a.id, a.employee_id, e.name, e.name_local, a.work_date, a.in_time, a.out_time, a.reason, a.status, a.decision_note, a.created_at
  from public.attendance_amendments a
  join public.employees e on e.id = a.employee_id and e.company_id = a.company_id
  where a.company_id = app.company_id() and a.status = p_status and app.can_review_amendment(a.employee_id)
  order by a.work_date, a.created_at limit 200;
end $$;

create function public.decide_amendment(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.attendance_amendments%rowtype;
  e public.employees%rowtype;
  t timestamptz;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into a from public.attendance_amendments where id = p_id and company_id = app.company_id() for update;
  if not found or not app.can_review_amendment(a.employee_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'amendment: already decided' using errcode = 'P0001'; end if;
  if coalesce(p_approve, false) then
    select * into e from public.employees where id = a.employee_id;
    if a.in_time is not null then
      t := app.amendment_moment(a.employee_id, a.work_date, a.in_time);
      insert into public.attendance_events (company_id, employee_id, branch_id, kind, client_event_id, device_time, occurred_at, flags)
      values (a.company_id, a.employee_id, e.branch_id, 'in', gen_random_uuid(), t, t, array['amended']);
    end if;
    if a.out_time is not null then
      t := app.amendment_moment(a.employee_id, a.work_date, a.out_time);
      insert into public.attendance_events (company_id, employee_id, branch_id, kind, client_event_id, device_time, occurred_at, flags)
      values (a.company_id, a.employee_id, e.branch_id, 'out', gen_random_uuid(), t, t, array['amended']);
    end if;
  end if;
  update public.attendance_amendments set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
    decided_by = app.membership_id(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = a.id;
end $$;

revoke execute on function public.request_amendment(date, time, time, text) from public, anon;
revoke execute on function public.cancel_amendment(uuid) from public, anon;
revoke execute on function public.my_amendments() from public, anon;
revoke execute on function public.amendment_review_list(text) from public, anon;
revoke execute on function public.decide_amendment(uuid, boolean, text) from public, anon;
grant execute on function public.request_amendment(date, time, time, text) to authenticated;
grant execute on function public.cancel_amendment(uuid) to authenticated;
grant execute on function public.my_amendments() to authenticated;
grant execute on function public.amendment_review_list(text) to authenticated;
grant execute on function public.decide_amendment(uuid, boolean, text) to authenticated;
