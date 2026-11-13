-- UPLIF Go, slice 2: the conversation per customer (notes with photos, manager comments) and the inbox.
-- Rules:
--  * One append-only list of events per customer. Nobody edits or deletes an event through the app.
--  * Anyone who can see a customer can add a note. Only people with sales.timeline.comment (managers, owners,
--    admins) can write a manager comment, and only on customers inside their own scope.
--  * Notes carry optional photos in the same private bucket as customer photos (<company>/<customer>/<file>).
--  * Every call takes a client_op_id so a note saved on a phone and sent twice is stored once.
--  * Visits and calls (slices 3 and 4) add their own event kinds to the same list.
-- Run the customers migration first.

insert into public.permissions (key, description) values
  ('sales.timeline.comment', 'Write manager comments on a customer conversation')
on conflict (key) do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'sales.timeline.comment', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'sales.timeline.comment', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

-- New companies: keep the seed function in step (adds the comment permission for Manager; Owner/Admin get all keys).
do $do$
declare src text;
begin
  select pg_get_functiondef('app.seed_system_roles(uuid)'::regprocedure) into src;
  if position('sales.timeline.comment' in src) = 0 then
    src := replace(src, E'  return owner_id;\nend', E'  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)\n  select p_company_id, ro.id, ''sales.timeline.comment'', ''team''\n  from public.roles ro where ro.company_id = p_company_id and ro.name = ''Manager'';\n  return owner_id;\nend');
    execute src;
  end if;
end $do$;

create type public.customer_event_kind as enum ('note', 'comment');

create table public.customer_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null,
  kind public.customer_event_kind not null,
  author_employee_id uuid,
  client_op_id uuid not null,
  body text not null default '' check (length(body) <= 4000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  unique (company_id, client_op_id),
  check (length(btrim(body)) > 0 or cardinality(photo_paths) > 0),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, author_employee_id) references public.employees (company_id, id) on delete set null (author_employee_id)
);
create index customer_events_customer_idx on public.customer_events (company_id, customer_id, created_at desc);

create table public.customer_event_reads (
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  customer_id uuid not null,
  last_read_at timestamptz not null default clock_timestamp(),
  primary key (employee_id, customer_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade
);

create trigger audit_customer_events after insert on public.customer_events for each row execute function app.audit_row();

alter table public.customer_events enable row level security;
alter table public.customer_events force row level security;
alter table public.customer_event_reads enable row level security;
alter table public.customer_event_reads force row level security;

create policy customer_events_select on public.customer_events for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
create policy customer_event_reads_select on public.customer_event_reads for select to authenticated
  using (company_id = (select app.company_id()) and employee_id = (select app.my_employee_id()));
grant select on public.customer_events, public.customer_event_reads to authenticated;

-- ---------- write ----------
create function app.sales_check_photo_paths(p_customer uuid, p_paths text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare p text;
begin
  foreach p in array coalesce(p_paths, '{}') loop
    if (string_to_array(p, '/'))[1] <> app.company_id()::text or (string_to_array(p, '/'))[2] <> p_customer::text
       or array_length(string_to_array(p, '/'), 1) <> 3 then
      raise exception 'picture does not belong to this customer' using errcode = '42501';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'sales-attachments' and o.name = p) then
      raise exception 'picture was not uploaded' using errcode = '22023';
    end if;
  end loop;
end $$;
revoke all on function app.sales_check_photo_paths(uuid, text[]) from public, anon, authenticated;

create function public.sales_add_note(p_customer_id uuid, p_client_op_id uuid, p_body text, p_photo_paths text[], p_occurred_at timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); ev uuid;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  if not app.can_read_customer(p_customer_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into ev from public.customer_events where company_id = cid and client_op_id = p_client_op_id;
  if found then return ev; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 and cardinality(coalesce(p_photo_paths, '{}')) = 0 then
    raise exception 'write a note or add a photo' using errcode = '22023';
  end if;
  perform app.sales_check_photo_paths(p_customer_id, p_photo_paths);
  insert into public.customer_events (company_id, customer_id, kind, author_employee_id, client_op_id, body, photo_paths, occurred_at)
  values (cid, p_customer_id, 'note', eid, p_client_op_id, btrim(coalesce(p_body, '')), coalesce(p_photo_paths, '{}'),
          least(coalesce(p_occurred_at, now()), now()))
  returning id into ev;
  insert into public.customer_event_reads (company_id, employee_id, customer_id) values (cid, eid, p_customer_id)
    on conflict (employee_id, customer_id) do update set last_read_at = clock_timestamp();
  return ev;
end $$;

create function public.sales_add_comment(p_customer_id uuid, p_client_op_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); ev uuid; c public.customers%rowtype;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  select * into c from public.customers where id = p_customer_id and company_id = cid;
  if not found or not app.customer_in_scope('sales.timeline.comment', c.owner_employee_id, c.created_by_employee_id, c.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into ev from public.customer_events where company_id = cid and client_op_id = p_client_op_id;
  if found then return ev; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'write a comment' using errcode = '22023'; end if;
  insert into public.customer_events (company_id, customer_id, kind, author_employee_id, client_op_id, body, occurred_at)
  values (cid, p_customer_id, 'comment', eid, p_client_op_id, btrim(p_body), now())
  returning id into ev;
  insert into public.customer_event_reads (company_id, employee_id, customer_id) values (cid, eid, p_customer_id)
    on conflict (employee_id, customer_id) do update set last_read_at = clock_timestamp();
  return ev;
end $$;

create function public.sales_mark_read(p_customer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null or not app.can_read_customer(p_customer_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.customer_event_reads (company_id, employee_id, customer_id) values (cid, eid, p_customer_id)
    on conflict (employee_id, customer_id) do update set last_read_at = clock_timestamp();
end $$;

-- ---------- read ----------
-- Oldest first inside the page; pass p_before (an event's created_at) to load older ones.
create function public.sales_timeline(p_customer_id uuid, p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or not app.can_read_customer(p_customer_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x.created_at) from (
    select ev.id, ev.kind, ev.body, ev.photo_paths, ev.occurred_at, ev.created_at,
           ev.author_employee_id, (ev.author_employee_id = eid) as mine,
           au.name as author_name, au.name_local as author_name_local
    from public.customer_events ev left join public.employees au on au.id = ev.author_employee_id and au.company_id = ev.company_id
    where ev.company_id = cid and ev.customer_id = p_customer_id and (p_before is null or ev.created_at < p_before)
    order by ev.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) x), '[]'::jsonb);
end $$;

-- One row per customer that has a conversation, newest activity first.
create function public.sales_inbox(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or (select app.permission_scope('sales.customer.read')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(r order by r.last_at desc) from (
    select c.id as customer_id, c.name, c.name_local, c.archived_at,
           le.kind, le.body, le.created_at as last_at, (cardinality(le.photo_paths) > 0) as has_photos,
           au.name as author_name, au.name_local as author_name_local, (le.author_employee_id = eid) as mine,
           (le.author_employee_id is distinct from eid and le.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)) as unread,
           (select ph.storage_path from public.customer_photos ph where ph.customer_id = c.id and ph.is_default) as photo_path
    from public.customers c
    join lateral (select e.* from public.customer_events e where e.customer_id = c.id and e.company_id = c.company_id
                  order by e.created_at desc limit 1) le on true
    left join public.employees au on au.id = le.author_employee_id and au.company_id = c.company_id
    left join public.customer_event_reads rd on rd.employee_id = eid and rd.customer_id = c.id
    where c.company_id = cid and c.archived_at is null
      and app.customer_in_scope('sales.customer.read', c.owner_employee_id, c.created_by_employee_id, c.branch_id)
    order by le.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) r), '[]'::jsonb);
end $$;

revoke execute on function public.sales_add_note(uuid, uuid, text, text[], timestamptz) from public, anon;
revoke execute on function public.sales_add_comment(uuid, uuid, text) from public, anon;
revoke execute on function public.sales_mark_read(uuid) from public, anon;
revoke execute on function public.sales_timeline(uuid, integer, timestamptz) from public, anon;
revoke execute on function public.sales_inbox(integer) from public, anon;
grant execute on function public.sales_add_note(uuid, uuid, text, text[], timestamptz) to authenticated;
grant execute on function public.sales_add_comment(uuid, uuid, text) to authenticated;
grant execute on function public.sales_mark_read(uuid) to authenticated;
grant execute on function public.sales_timeline(uuid, integer, timestamptz) to authenticated;
grant execute on function public.sales_inbox(integer) to authenticated;

-- The app needs to know whether to show the manager comment box.
create or replace function public.sales_my_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  e public.employees%rowtype;
  comp public.companies%rowtype;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if eid is null then return jsonb_build_object('linked', false); end if;
  select * into e from public.employees where id = eid and company_id = cid;
  select * into comp from public.companies where id = cid;
  return jsonb_build_object(
    'linked', true, 'module', app.module_enabled(cid, 'field_sales'),
    'employee_id', eid, 'employee_name', e.name, 'employee_name_local', e.name_local, 'active', e.status = 'active',
    'company_id', cid, 'company_name', comp.name,
    'can_read', (select app.permission_scope('sales.customer.read')) is not null,
    'can_create', (select app.permission_scope('sales.customer.create')) is not null,
    'can_update', (select app.permission_scope('sales.customer.update')) is not null,
    'can_manage', (select app.permission_scope('sales.customer.manage')) is not null,
    'can_comment', (select app.permission_scope('sales.timeline.comment')) is not null);
end $$;
