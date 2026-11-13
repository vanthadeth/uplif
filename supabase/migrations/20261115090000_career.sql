-- Career (UPLIF Me > Record > Job description, and promotion history).
-- Rules:
--  * One permission, career.record.manage (Owner/Admin, company scope), writes job descriptions and records promotions or transfers.
--  * A job description belongs to a position: a short summary and a list of duties (one per line, English and local).
--  * A promotion or transfer moves a person to another position as of a date that is today or earlier. It keeps the old and new
--    position names as they were, so renaming a position later never rewrites history. The person's position is changed by the same call.
--  * Staff read their own position's description and their own history. Nobody writes these tables directly; all changes are audited.

insert into public.permissions (key, description, description_local) values
  ('career.record.manage', 'Write job descriptions and record promotions', 'សរសេរការពិពណ៌នាការងារ និងកត់ត្រាការតម្លើងតួនាទី')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'career.record.manage', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;

create type public.career_event_kind as enum ('promotion', 'transfer');

create table public.position_descriptions (
  company_id uuid not null references public.companies (id) on delete cascade,
  position_id uuid not null,
  summary text check (summary is null or length(summary) <= 2000),
  summary_local text check (summary_local is null or length(summary_local) <= 2000),
  duties text check (duties is null or length(duties) <= 6000),
  duties_local text check (duties_local is null or length(duties_local) <= 6000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (position_id),
  unique (company_id, position_id),
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete cascade,
  foreign key (company_id, updated_by) references public.memberships (company_id, id) on delete set null (updated_by)
);

create table public.career_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  kind public.career_event_kind not null,
  event_date date not null,
  from_position_id uuid,
  to_position_id uuid,
  from_name text,
  from_name_local text,
  to_name text not null,
  to_name_local text,
  note text check (note is null or length(note) <= 1000),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, from_position_id) references public.positions (company_id, id) on delete set null (from_position_id),
  foreign key (company_id, to_position_id) references public.positions (company_id, id) on delete set null (to_position_id),
  foreign key (company_id, recorded_by) references public.memberships (company_id, id) on delete set null (recorded_by)
);
create index career_events_employee_idx on public.career_events (company_id, employee_id, event_date desc);

create trigger audit_position_descriptions after insert or update or delete on public.position_descriptions for each row execute function app.audit_row();
create trigger audit_career_events after insert on public.career_events for each row execute function app.audit_row();

alter table public.position_descriptions enable row level security;
alter table public.position_descriptions force row level security;
alter table public.career_events enable row level security;
alter table public.career_events force row level security;

create policy position_descriptions_select on public.position_descriptions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('career.record.manage')) = 'company');
create policy career_events_select on public.career_events for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.permission_scope('career.record.manage')) = 'company'));
grant select on public.position_descriptions, public.career_events to authenticated;

-- ---------- job descriptions ----------
create function public.save_position_description(p_position_id uuid, p_summary text, p_summary_local text, p_duties text, p_duties_local text)
returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not (select app.is_active_member()) or (select app.permission_scope('career.record.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.positions where id = p_position_id and company_id = cid) then
    raise exception 'position not found' using errcode = 'P0002';
  end if;
  insert into public.position_descriptions (company_id, position_id, summary, summary_local, duties, duties_local, updated_by)
  values (cid, p_position_id, nullif(btrim(coalesce(p_summary, '')), ''), nullif(btrim(coalesce(p_summary_local, '')), ''),
          nullif(btrim(coalesce(p_duties, '')), ''), nullif(btrim(coalesce(p_duties_local, '')), ''), app.membership_id())
  on conflict (position_id) do update
    set summary = excluded.summary, summary_local = excluded.summary_local, duties = excluded.duties,
        duties_local = excluded.duties_local, updated_by = excluded.updated_by, updated_at = now();
end $$;

-- The caller's own position and its description. No row when they have no position.
create function public.my_job_description()
returns table (position_name text, position_name_local text, summary text, summary_local text, duties text, duties_local text)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.name, p.name_local, d.summary, d.summary_local, d.duties, d.duties_local
  from public.employees e
  join public.positions p on p.id = e.position_id and p.company_id = e.company_id
  left join public.position_descriptions d on d.position_id = p.id
  where e.id = eid;
end $$;

-- ---------- promotions and transfers ----------
create function public.record_career_event(p_employee_id uuid, p_kind public.career_event_kind, p_position_id uuid, p_date date, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  emp record;
  newp record;
  oldp record;
  evid uuid;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('career.record.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into emp from public.employees where id = p_employee_id and company_id = cid;
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if emp.status <> 'active' then raise exception 'employee is not active' using errcode = '22023'; end if;
  select * into newp from public.positions where id = p_position_id and company_id = cid;
  if not found then raise exception 'position not found' using errcode = 'P0002'; end if;
  if emp.position_id is not distinct from p_position_id then raise exception 'already in this position' using errcode = '22023'; end if;
  if p_date is null or p_date > current_date then raise exception 'date cannot be in the future' using errcode = '22023'; end if;
  if emp.employment_date is not null and p_date < emp.employment_date then raise exception 'date is before they joined' using errcode = '22023'; end if;
  select * into oldp from public.positions where id = emp.position_id and company_id = cid;

  insert into public.career_events (company_id, employee_id, kind, event_date, from_position_id, to_position_id,
                                    from_name, from_name_local, to_name, to_name_local, note, recorded_by)
  values (cid, p_employee_id, p_kind, p_date, oldp.id, newp.id, oldp.name, oldp.name_local, newp.name, newp.name_local,
          nullif(btrim(coalesce(p_note, '')), ''), app.membership_id())
  returning id into evid;
  update public.employees set position_id = p_position_id where id = p_employee_id and company_id = cid;
  return evid;
end $$;

-- The caller's own history, newest first.
create function public.my_career()
returns table (id uuid, kind public.career_event_kind, event_date date, from_name text, from_name_local text, to_name text, to_name_local text, note text)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id, c.kind, c.event_date, c.from_name, c.from_name_local, c.to_name, c.to_name_local, c.note
  from public.career_events c where c.employee_id = eid order by c.event_date desc, c.created_at desc;
end $$;

revoke all on function public.save_position_description(uuid, text, text, text, text), public.my_job_description(),
  public.record_career_event(uuid, public.career_event_kind, uuid, date, text), public.my_career() from public, anon;
grant execute on function public.save_position_description(uuid, text, text, text, text), public.my_job_description(),
  public.record_career_event(uuid, public.career_event_kind, uuid, date, text), public.my_career() to authenticated;
