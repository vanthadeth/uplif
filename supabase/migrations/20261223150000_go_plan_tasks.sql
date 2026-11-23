-- UPLIF Go, plan and tasks (canvas slice 4).
--  * A plan stop is one customer on one day, with an optional time and a kind (planned, appointment, assigned, delivery, collection).
--    Reps add their own stops. Managers assigning stops to reps arrives with the manager view (slice 5).
--  * "Next visit" in a visit or call log makes a planned stop for that day, so the rep sees it on Today.
--  * A task is a reminder with a title, an optional customer and a due day. It is overdue after its day passes.
--  * Everything is the employee's own: they see and change only their rows. Every call takes a client id so an offline resend is stored once.

create table public.sales_plan_stops (
  id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  customer_id uuid not null,
  planned_for date not null,
  planned_time time,
  kind text not null default 'planned' check (kind in ('planned', 'appointment', 'assigned', 'delivery', 'collection')),
  note text check (note is null or length(note) <= 500),
  source_event_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade
);
create index sales_plan_stops_day_idx on public.sales_plan_stops (company_id, employee_id, planned_for);

create table public.sales_tasks (
  id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  customer_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  due_date date not null,
  done_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade
);
create index sales_tasks_open_idx on public.sales_tasks (company_id, employee_id, due_date) where done_at is null;

create trigger audit_sales_plan_stops after insert or update on public.sales_plan_stops for each row execute function app.audit_row();
create trigger audit_sales_tasks after insert or update on public.sales_tasks for each row execute function app.audit_row();

alter table public.sales_plan_stops enable row level security;
alter table public.sales_plan_stops force row level security;
alter table public.sales_tasks enable row level security;
alter table public.sales_tasks force row level security;
create policy sales_plan_stops_own on public.sales_plan_stops for select to authenticated
  using (company_id = (select app.company_id()) and employee_id = (select app.my_employee_id()));
create policy sales_tasks_own on public.sales_tasks for select to authenticated
  using (company_id = (select app.company_id()) and employee_id = (select app.my_employee_id()));

-- The plan for one day: stops in time order with the customer's name, and whether a visit already happened that day.
create function public.sales_plan_day(p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(r order by r.planned_time nulls last, r.created_at) from (
    select s.id, s.customer_id, c.name, c.name_local, c.address, s.planned_time, s.kind, s.note, s.created_at,
           exists (select 1 from public.visits v where v.company_id = cid and v.employee_id = eid and v.customer_id = s.customer_id
                   and v.checked_in_at::date = s.planned_for) as visited,
           (select max(v.checked_in_at) from public.visits v where v.company_id = cid and v.customer_id = s.customer_id and v.employee_id = eid) as last_visit_at
    from public.sales_plan_stops s join public.customers c on c.company_id = s.company_id and c.id = s.customer_id
    where s.company_id = cid and s.employee_id = eid and s.planned_for = p_day and s.cancelled_at is null
  ) r), '[]'::jsonb);
end $$;

create function public.sales_plan_add(p_id uuid, p_customer_id uuid, p_day date, p_time time, p_kind text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  if not app.can_read_customer(p_customer_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('planned', 'appointment', 'delivery', 'collection') then raise exception 'unknown choice' using errcode = '22023'; end if;
  if exists (select 1 from public.sales_plan_stops where company_id = cid and id = p_id) then return p_id; end if;
  insert into public.sales_plan_stops (id, company_id, employee_id, customer_id, planned_for, planned_time, kind, note)
  values (p_id, cid, eid, p_customer_id, p_day, p_time, p_kind, nullif(btrim(coalesce(p_note, '')), ''));
  return p_id;
end $$;

create function public.sales_plan_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.sales_plan_stops set cancelled_at = coalesce(cancelled_at, now()) where company_id = cid and id = p_id and employee_id = eid;
end $$;

-- Open tasks (overdue first) and tasks done in the last 2 days.
create function public.sales_task_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(r order by r.done_at is not null, r.due_date, r.created_at) from (
    select t.id, t.title, t.due_date, t.done_at, t.created_at, t.customer_id, c.name, c.name_local
    from public.sales_tasks t left join public.customers c on c.company_id = t.company_id and c.id = t.customer_id
    where t.company_id = cid and t.employee_id = eid and (t.done_at is null or t.done_at > now() - interval '2 days')
  ) r), '[]'::jsonb);
end $$;

create function public.sales_task_add(p_id uuid, p_title text, p_customer_id uuid, p_due date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  if p_customer_id is not null and not app.can_read_customer(p_customer_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.sales_tasks where company_id = cid and id = p_id) then return p_id; end if;
  insert into public.sales_tasks (id, company_id, employee_id, customer_id, title, due_date) values (p_id, cid, eid, p_customer_id, btrim(p_title), p_due);
  return p_id;
end $$;

create function public.sales_task_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.sales_tasks set done_at = case when p_done then coalesce(done_at, now()) else null end
  where company_id = cid and id = p_id and employee_id = eid;
end $$;

-- A visit or call that sets "next" now also plans a stop for that day (once per log).
create or replace function app.sales_plan_from_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('visit', 'call') and new.detail ? 'next' and new.detail->>'next' is not null and new.author_employee_id is not null then
    insert into public.sales_plan_stops (id, company_id, employee_id, customer_id, planned_for, kind, note, source_event_id)
    values (gen_random_uuid(), new.company_id, new.author_employee_id, new.customer_id, (new.detail->>'next')::date, 'planned', null, new.id);
  end if;
  return new;
end $$;
revoke all on function app.sales_plan_from_log() from public, anon, authenticated;
create trigger customer_events_plan after insert on public.customer_events for each row execute function app.sales_plan_from_log();

revoke execute on function public.sales_plan_day(date) from public, anon;
revoke execute on function public.sales_plan_add(uuid, uuid, date, time, text, text) from public, anon;
revoke execute on function public.sales_plan_cancel(uuid) from public, anon;
revoke execute on function public.sales_task_list() from public, anon;
revoke execute on function public.sales_task_add(uuid, text, uuid, date) from public, anon;
revoke execute on function public.sales_task_done(uuid, boolean) from public, anon;
grant execute on function public.sales_plan_day(date) to authenticated;
grant execute on function public.sales_plan_add(uuid, uuid, date, time, text, text) to authenticated;
grant execute on function public.sales_plan_cancel(uuid) to authenticated;
grant execute on function public.sales_task_list() to authenticated;
grant execute on function public.sales_task_add(uuid, text, uuid, date) to authenticated;
grant execute on function public.sales_task_done(uuid, boolean) to authenticated;
