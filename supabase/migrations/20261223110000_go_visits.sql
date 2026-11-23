-- UPLIF Go, check-in (canvas slice 2): a visit is one check-in at a customer, or with no customer, until check-out.
-- Rules:
--  * One open visit per employee, enforced here by a unique index, so two phones cannot both be checked in.
--  * Check-in and check-out take a client id so a tap saved on a phone and sent twice is stored once.
--  * The phone's GPS is saved with the check-in. A far check-in is recorded, never refused; the rep adds a reason later.
--  * Nobody edits a visit through a table: reads go through the functions below and the own-visits policy.
-- Run the customers and timeline migrations first.

create table public.visits (
  id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  customer_id uuid,
  checked_in_at timestamptz not null,
  in_latitude double precision check (in_latitude is null or in_latitude between -90 and 90),
  in_longitude double precision check (in_longitude is null or in_longitude between -180 and 180),
  in_accuracy_m integer check (in_accuracy_m is null or in_accuracy_m >= 0),
  distance_m integer check (distance_m is null or distance_m >= 0),
  outside_range boolean not null default false,
  far_reason text check (far_reason is null or length(far_reason) <= 500),
  checked_out_at timestamptz,
  out_latitude double precision check (out_latitude is null or out_latitude between -90 and 90),
  out_longitude double precision check (out_longitude is null or out_longitude between -180 and 180),
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check ((in_latitude is null) = (in_longitude is null)),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete set null (customer_id)
);
create unique index visits_one_open_idx on public.visits (employee_id) where checked_out_at is null;
create index visits_employee_idx on public.visits (company_id, employee_id, checked_in_at desc);
create index visits_customer_idx on public.visits (company_id, customer_id, checked_in_at desc);

create trigger audit_visits after insert or update on public.visits for each row execute function app.audit_row();

alter table public.visits enable row level security;
alter table public.visits force row level security;
create policy visits_select_own on public.visits for select to authenticated
  using (company_id = (select app.company_id()) and employee_id = (select app.my_employee_id()));

-- app.distance_m (metres between two points) already exists from the attendance migration.

-- Allowed distance from a customer, in metres. A company setting can replace this later.
create function app.visit_range_m() returns integer language sql immutable set search_path = '' as $$ select 100 $$;

-- The employee's open visit, or null.
create function public.sales_open_visit() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id(); cid uuid := app.company_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', v.id, 'customer_id', v.customer_id, 'checked_in_at', v.checked_in_at,
            'outside_range', v.outside_range, 'distance_m', v.distance_m, 'name', c.name, 'name_local', c.name_local)
          from public.visits v left join public.customers c on c.company_id = v.company_id and c.id = v.customer_id
          where v.company_id = cid and v.employee_id = eid and v.checked_out_at is null);
end $$;

-- Customers the employee may see, nearest first, with the distance from the phone. Customers without a saved
-- location come last with no distance. Planned and assigned times arrive with the plan (slice 4).
create function public.sales_nearby(p_latitude double precision, p_longitude double precision, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not (select app.is_active_member()) or (select app.permission_scope('sales.customer.read')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(r order by r.distance_m nulls last, r.name) from (
    select c.id as customer_id, c.name, c.name_local, c.address,
           round(app.distance_m(p_latitude, p_longitude, c.latitude, c.longitude))::integer as distance_m,
           (c.latitude is not null and app.distance_m(p_latitude, p_longitude, c.latitude, c.longitude) <= app.visit_range_m()) as in_range
    from public.customers c
    where c.company_id = cid and c.archived_at is null
      and app.customer_in_scope('sales.customer.read', c.owner_employee_id, c.created_by_employee_id, c.branch_id)
    order by app.distance_m(p_latitude, p_longitude, c.latitude, c.longitude) nulls last, c.name
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) r), '[]'::jsonb);
end $$;

-- Check in. Sending the same id again returns the same visit. If the employee is already checked in somewhere
-- else, nothing is created and the open visit comes back with already_open = true.
create function public.sales_check_in(p_id uuid, p_customer_id uuid, p_latitude double precision, p_longitude double precision,
                                      p_accuracy_m integer, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); v public.visits; cust public.customers; dist integer; far boolean := false;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (select app.module_enabled(cid, 'field_sales')) then raise exception 'module not in plan' using errcode = '42501'; end if;
  if p_id is null or p_at is null then raise exception 'id and time are required' using errcode = '22023'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'latitude and longitude go together' using errcode = '22023'; end if;

  select * into v from public.visits where company_id = cid and id = p_id;
  if found then
    if v.employee_id <> eid then raise exception 'not allowed' using errcode = '42501'; end if;
    return jsonb_build_object('id', v.id, 'already_open', false, 'outside_range', v.outside_range, 'distance_m', v.distance_m);
  end if;

  select * into v from public.visits where company_id = cid and employee_id = eid and checked_out_at is null;
  if found then
    return jsonb_build_object('id', v.id, 'already_open', true, 'customer_id', v.customer_id, 'checked_in_at', v.checked_in_at);
  end if;

  if p_customer_id is not null then
    if not app.can_read_customer(p_customer_id) then raise exception 'not allowed' using errcode = '42501'; end if;
    select * into cust from public.customers where company_id = cid and id = p_customer_id;
    if cust.latitude is not null and p_latitude is not null then
      dist := round(app.distance_m(p_latitude, p_longitude, cust.latitude, cust.longitude))::integer;
      far := dist > app.visit_range_m();
    end if;
  end if;

  insert into public.visits (id, company_id, employee_id, customer_id, checked_in_at, in_latitude, in_longitude, in_accuracy_m, distance_m, outside_range)
  values (p_id, cid, eid, p_customer_id, p_at, p_latitude, p_longitude, p_accuracy_m, dist, far);
  return jsonb_build_object('id', p_id, 'already_open', false, 'outside_range', far, 'distance_m', dist);
end $$;

-- Check out of the employee's own open visit. Checking out twice is fine.
create function public.sales_check_out(p_id uuid, p_latitude double precision, p_longitude double precision, p_at timestamptz,
                                       p_far_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id(); v public.visits;
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.visits where company_id = cid and id = p_id and employee_id = eid;
  if not found then raise exception 'visit not found' using errcode = 'P0002'; end if;
  if v.checked_out_at is null then
    update public.visits set checked_out_at = greatest(p_at, checked_in_at), out_latitude = p_latitude, out_longitude = p_longitude,
           far_reason = coalesce(nullif(btrim(coalesce(p_far_reason, '')), ''), far_reason)
    where id = v.id and company_id = cid;
  end if;
  return jsonb_build_object('id', p_id, 'closed', true);
end $$;

-- Add or change the reason for a check-in that was far from the customer.
create function public.sales_visit_reason(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.visits set far_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where company_id = cid and id = p_id and employee_id = eid and outside_range;
  if not found then raise exception 'visit not found' using errcode = 'P0002'; end if;
end $$;

revoke execute on function public.sales_open_visit() from public, anon;
revoke execute on function public.sales_nearby(double precision, double precision, integer) from public, anon;
revoke execute on function public.sales_check_in(uuid, uuid, double precision, double precision, integer, timestamptz) from public, anon;
revoke execute on function public.sales_check_out(uuid, double precision, double precision, timestamptz, text) from public, anon;
revoke execute on function public.sales_visit_reason(uuid, text) from public, anon;
grant execute on function public.sales_open_visit() to authenticated;
grant execute on function public.sales_nearby(double precision, double precision, integer) to authenticated;
grant execute on function public.sales_check_in(uuid, uuid, double precision, double precision, integer, timestamptz) to authenticated;
grant execute on function public.sales_check_out(uuid, double precision, double precision, timestamptz, text) to authenticated;
grant execute on function public.sales_visit_reason(uuid, text) to authenticated;
