-- UPLIF Go, visit and call logging (canvas slice 3). Run after 20261223110000_go_visits.sql and the enum step.
-- A visit or call is one more event in the customer conversation, with its answers kept in a detail column.
--  * sales_log_visit closes the employee's open visit and writes the event. A visit without a customer only closes.
--  * sales_log_call writes a call event. Calls are logged by hand after the call.
--  * Both take a client_op_id so a log saved on a phone and sent twice is stored once.
--  * Choices are checked here so a bad value from an old phone cannot get in. "Next visit" is stored now;
--    follow-ups and reminders come with the plan (slice 4).

alter table public.customer_events add column detail jsonb;
do $do$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.customer_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%cardinality(photo_paths) > 0%';
  if c is not null then execute format('alter table public.customer_events drop constraint %I', c); end if;
end $do$;
alter table public.customer_events add constraint customer_events_content_check
  check (kind in ('visit', 'call') or length(btrim(body)) > 0 or cardinality(photo_paths) > 0);

create function app.sales_check_log(p_kind text, p_reason text, p_status text, p_order text, p_collection text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_kind = 'visit' then
    if coalesce(p_reason, '') not in ('regular', 'appointment', 'sale_follow_up', 'delivery', 'collection_follow_up', 'resolve_conflict')
       or coalesce(p_status, '') not in ('met_owner', 'met_staff', 'nobody', 'closed') then raise exception 'unknown choice' using errcode = '22023'; end if;
  else
    if coalesce(p_reason, '') not in ('customer_care', 'sale_follow_up', 'delivery_confirm', 'collection_notify', 'collection_follow_up', 'resolve_conflict')
       or coalesce(p_status, '') not in ('spoke_owner', 'spoke_staff', 'no_answer') then raise exception 'unknown choice' using errcode = '22023'; end if;
  end if;
  if coalesce(p_order, '') not in ('ordered', 'will_order', 'no_order') or coalesce(p_collection, '') not in ('fully_paid', 'partially_paid', 'delay_payment', 'not_yet_due', 'nothing_to_collect') then
    raise exception 'unknown choice' using errcode = '22023';
  end if;
end $$;
revoke all on function app.sales_check_log(text, text, text, text, text) from public, anon, authenticated;

create function public.sales_log_visit(p_visit_id uuid, p_client_op_id uuid, p_reason text, p_status text, p_order text, p_collection text,
                                       p_next date, p_notes text, p_photo_paths text[], p_latitude double precision, p_longitude double precision,
                                       p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); v public.visits; ev uuid; closed timestamptz;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  select id into ev from public.customer_events where company_id = cid and client_op_id = p_client_op_id;
  if found then return jsonb_build_object('event_id', ev, 'closed', true); end if;
  select * into v from public.visits where company_id = cid and id = p_visit_id and employee_id = eid;
  if not found then raise exception 'visit not found' using errcode = 'P0002'; end if;
  perform app.sales_check_log('visit', p_reason, p_status, p_order, p_collection);
  closed := greatest(coalesce(p_at, now()), v.checked_in_at);
  if v.checked_out_at is null then
    update public.visits set checked_out_at = closed, out_latitude = p_latitude, out_longitude = p_longitude where id = v.id and company_id = cid;
  else
    closed := v.checked_out_at;
  end if;
  if v.customer_id is null then return jsonb_build_object('event_id', null, 'closed', true); end if;
  perform app.sales_check_photo_paths(v.customer_id, p_photo_paths);
  insert into public.customer_events (company_id, customer_id, kind, author_employee_id, client_op_id, body, photo_paths, occurred_at, detail)
  values (cid, v.customer_id, 'visit', eid, p_client_op_id, btrim(coalesce(p_notes, '')), coalesce(p_photo_paths, '{}'), least(closed, now()),
          jsonb_build_object('visit_id', v.id, 'reason', p_reason, 'status', p_status, 'order', p_order, 'collection', p_collection,
                             'next', p_next, 'minutes', greatest(0, round(extract(epoch from (closed - v.checked_in_at)) / 60)),
                             'outside_range', v.outside_range))
  returning id into ev;
  insert into public.customer_event_reads (company_id, employee_id, customer_id) values (cid, eid, v.customer_id)
    on conflict (employee_id, customer_id) do update set last_read_at = clock_timestamp();
  return jsonb_build_object('event_id', ev, 'closed', true);
end $$;

create function public.sales_log_call(p_customer_id uuid, p_client_op_id uuid, p_reason text, p_status text, p_order text, p_collection text,
                                      p_next date, p_notes text, p_photo_paths text[], p_started_at timestamptz, p_duration_s integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); ev uuid;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  if not app.can_read_customer(p_customer_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into ev from public.customer_events where company_id = cid and client_op_id = p_client_op_id;
  if found then return ev; end if;
  perform app.sales_check_log('call', p_reason, p_status, p_order, p_collection);
  perform app.sales_check_photo_paths(p_customer_id, p_photo_paths);
  insert into public.customer_events (company_id, customer_id, kind, author_employee_id, client_op_id, body, photo_paths, occurred_at, detail)
  values (cid, p_customer_id, 'call', eid, p_client_op_id, btrim(coalesce(p_notes, '')), coalesce(p_photo_paths, '{}'),
          least(coalesce(p_started_at, now()), now()),
          jsonb_build_object('reason', p_reason, 'status', p_status, 'order', p_order, 'collection', p_collection, 'next', p_next,
                             'seconds', greatest(0, coalesce(p_duration_s, 0))))
  returning id into ev;
  insert into public.customer_event_reads (company_id, employee_id, customer_id) values (cid, eid, p_customer_id)
    on conflict (employee_id, customer_id) do update set last_read_at = clock_timestamp();
  return ev;
end $$;

-- The conversation now returns the detail of visits and calls.
create or replace function public.sales_timeline(p_customer_id uuid, p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or not app.can_read_customer(p_customer_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x.created_at) from (
    select ev.id, ev.kind, ev.body, ev.photo_paths, ev.occurred_at, ev.created_at, ev.detail,
           ev.author_employee_id, (ev.author_employee_id = eid) as mine,
           au.name as author_name, au.name_local as author_name_local
    from public.customer_events ev left join public.employees au on au.id = ev.author_employee_id and au.company_id = ev.company_id
    where ev.company_id = cid and ev.customer_id = p_customer_id and (p_before is null or ev.created_at < p_before)
    order by ev.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) x), '[]'::jsonb);
end $$;

revoke execute on function public.sales_log_visit(uuid, uuid, text, text, text, text, date, text, text[], double precision, double precision, timestamptz) from public, anon;
revoke execute on function public.sales_log_call(uuid, uuid, text, text, text, text, date, text, text[], timestamptz, integer) from public, anon;
grant execute on function public.sales_log_visit(uuid, uuid, text, text, text, text, date, text, text[], double precision, double precision, timestamptz) to authenticated;
grant execute on function public.sales_log_call(uuid, uuid, text, text, text, text, date, text, text[], timestamptz, integer) to authenticated;
