-- In-app notifications for UPLIF Me (the bell).
--  * A notification belongs to one employee. It stores a kind and a few facts (dates, a percent, a position name); the app writes the
--    sentence in the person's language, so nothing here needs translating.
--  * They are created by the database itself when something happens to the person: a leave request or an attendance correction is
--    decided, a performance review is saved, or a promotion or transfer is recorded. Nobody writes them directly.
--  * Each person has one switch, on by default. When it is off, nothing new is saved for them.
--  * People read only their own. Reading marks nothing; the app calls mark_notifications_read.

create table public.notification_settings (
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid primary key,
  in_app boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  kind text not null check (kind in ('leave_approved', 'leave_rejected', 'amendment_approved', 'amendment_rejected', 'performance_review', 'promotion', 'transfer')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index notifications_employee_idx on public.notifications (employee_id, created_at desc);

alter table public.notification_settings enable row level security;
alter table public.notification_settings force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notification_settings_select on public.notification_settings for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()) and employee_id = (select app.my_employee_id()));
create policy notifications_select on public.notifications for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()) and employee_id = (select app.my_employee_id()));
grant select on public.notification_settings, public.notifications to authenticated;

-- ---------- creating ----------
create function app.notify(p_company_id uuid, p_employee_id uuid, p_kind text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select s.in_app from public.notification_settings s where s.employee_id = p_employee_id), true) then
    insert into public.notifications (company_id, employee_id, kind, data) values (p_company_id, p_employee_id, p_kind, coalesce(p_data, '{}'::jsonb));
  end if;
end $$;
revoke all on function app.notify(uuid, uuid, text, jsonb) from public, anon, authenticated;

create function app.notify_leave_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform app.notify(new.company_id, new.employee_id, 'leave_' || new.status,
      jsonb_build_object('start', new.start_date, 'end', new.end_date, 'days', new.days, 'note', new.decision_note));
  end if;
  return new;
end $$;
create trigger notify_leave_decided after update on public.leave_requests for each row execute function app.notify_leave_decided();

create function app.notify_amendment_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform app.notify(new.company_id, new.employee_id, 'amendment_' || new.status,
      jsonb_build_object('date', new.work_date, 'note', new.decision_note));
  end if;
  return new;
end $$;
create trigger notify_amendment_decided after update on public.attendance_amendments for each row execute function app.notify_amendment_decided();

create function app.notify_review_saved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(new.company_id, new.employee_id, 'performance_review', jsonb_build_object('period', new.period, 'percent', new.overall_percent));
  return new;
end $$;
create trigger notify_review_saved after insert or update of overall_percent on public.performance_reviews for each row execute function app.notify_review_saved();

create function app.notify_career_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(new.company_id, new.employee_id, new.kind::text,
    jsonb_build_object('date', new.event_date, 'to', new.to_name, 'to_local', new.to_name_local));
  return new;
end $$;
create trigger notify_career_event after insert on public.career_events for each row execute function app.notify_career_event();

-- ---------- reading and settings ----------
create function public.my_notifications(p_limit integer default 50)
returns table (id uuid, kind text, data jsonb, created_at timestamptz, read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select n.id, n.kind, n.data, n.created_at, n.read_at from public.notifications n
  where n.employee_id = eid order by n.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create function public.my_unread_notifications() returns integer
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return (select count(*)::int from public.notifications n where n.employee_id = eid and n.read_at is null);
end $$;

-- p_ids null marks everything of the caller's as read.
create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
  where employee_id = eid and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

create function public.my_notification_setting() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select s.in_app from public.notification_settings s where s.employee_id = eid), true);
end $$;

create function public.set_my_notification_setting(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_on is null then raise exception 'choose on or off' using errcode = '22023'; end if;
  insert into public.notification_settings (company_id, employee_id, in_app) values (app.company_id(), eid, p_on)
  on conflict (employee_id) do update set in_app = excluded.in_app, updated_at = now();
end $$;

revoke all on function public.my_notifications(integer), public.my_unread_notifications(), public.mark_notifications_read(uuid[]),
  public.my_notification_setting(), public.set_my_notification_setting(boolean) from public, anon;
grant execute on function public.my_notifications(integer), public.my_unread_notifications(), public.mark_notifications_read(uuid[]),
  public.my_notification_setting(), public.set_my_notification_setting(boolean) to authenticated;
