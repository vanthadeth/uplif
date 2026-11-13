-- UPLIF Go (field sales), slice 1: customers, contacts and photos.
-- Rules (plan approved 2026-11-13):
--  * One shared customer table per company. Any user who may create customers can register one during a visit.
--    Who SEES a customer follows the permission scope: own (registered by or assigned to me), team, branch, company.
--  * A customer has many contacts (name, phone, one default) and many photos (type, note, one optional default).
--  * Writes go through public.sales_save_customer(). The caller may pick the new customer's id, so a phone that
--    was offline can create the customer and upload its photos first and send everything later (safe to retry).
--  * Photos live in the private bucket sales-attachments at <company id>/<customer id>/<file>.
--  * Plans: the module is field_sales (Premium has it, Lite does not).
-- Run the playbook strings migration first.

insert into public.permissions (key, description) values
  ('sales.customer.read', 'See customers'),
  ('sales.customer.create', 'Register new customers'),
  ('sales.customer.update', 'Edit customers, contacts and photos'),
  ('sales.customer.manage', 'Archive customers and hand them to another salesperson')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin') and p.key like 'sales.customer.%'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, k.scope::public.data_scope
from public.roles ro cross join (values
  ('sales.customer.read', 'team'), ('sales.customer.create', 'company'),
  ('sales.customer.update', 'team'), ('sales.customer.manage', 'team')) as k(key, scope)
where ro.is_system and ro.name = 'Manager'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, 'own'::public.data_scope
from public.roles ro cross join (values ('sales.customer.read'), ('sales.customer.create'), ('sales.customer.update')) as k(key)
where ro.is_system and ro.name = 'Sales rep'
on conflict do nothing;

create or replace function app.seed_system_roles(p_company_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
begin
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Owner', true) returning id into owner_id;
  insert into public.roles (company_id, name, is_system) values
    (p_company_id, 'Admin', true), (p_company_id, 'Manager', true), (p_company_id, 'Sales rep', true),
    (p_company_id, 'Warehouse', true), (p_company_id, 'Accountant', true), (p_company_id, 'Staff', true);

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name in ('Owner', 'Admin');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, p.key, 'company'
  from public.roles ro cross join public.permissions p
  where ro.company_id = p_company_id and ro.name = 'Manager'
    and p.key in ('org.branch.read', 'org.member.read', 'org.role.read', 'org.audit.read', 'org.employee.read');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.schedule.read', 'team'
  from public.roles ro where ro.company_id = p_company_id and ro.name = 'Manager';

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'org.branch.read', 'branch'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.schedule.read', 'own'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.holiday.read', 'company'
  from public.roles ro
  where ro.company_id = p_company_id and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, k.key, k.scope::public.data_scope
  from public.roles ro cross join (values ('attendance.record.read', 'team'), ('attendance.selfie.view', 'team')) as k(key, scope)
  where ro.company_id = p_company_id and ro.name = 'Manager';

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.clock.self', 'own'
  from public.roles ro where ro.company_id = p_company_id and ro.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant', 'Staff');

  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, 'attendance.record.read', 'own'
  from public.roles ro where ro.company_id = p_company_id and ro.name in ('Sales rep', 'Warehouse', 'Accountant', 'Staff');
  -- field sales (slice 1)
  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, k.key, k.scope::public.data_scope
  from public.roles ro cross join (values
    ('sales.customer.read', 'team'), ('sales.customer.create', 'company'),
    ('sales.customer.update', 'team'), ('sales.customer.manage', 'team')) as k(key, scope)
  where ro.company_id = p_company_id and ro.name = 'Manager';
  insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
  select p_company_id, ro.id, k.key, 'own'::public.data_scope
  from public.roles ro cross join (values ('sales.customer.read'), ('sales.customer.create'), ('sales.customer.update')) as k(key)
  where ro.company_id = p_company_id and ro.name = 'Sales rep';
  return owner_id;
end $$;

-- ---------- tables ----------
create type public.customer_photo_type as enum ('storefront', 'display_shelf', 'damage_proof', 'competitor_product', 'other');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid,
  owner_employee_id uuid,
  created_by_employee_id uuid,
  client_op_id uuid,
  name text not null check (length(btrim(name)) between 1 and 200),
  name_local text check (name_local is null or length(name_local) <= 200),
  address text check (address is null or length(address) <= 500),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  notes text check (notes is null or length(notes) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, client_op_id),
  check ((latitude is null) = (longitude is null)),
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete set null (branch_id),
  foreign key (company_id, owner_employee_id) references public.employees (company_id, id) on delete set null (owner_employee_id),
  foreign key (company_id, created_by_employee_id) references public.employees (company_id, id) on delete set null (created_by_employee_id)
);
create index customers_company_idx on public.customers (company_id, archived_at, name);
create index customers_owner_idx on public.customers (company_id, owner_employee_id);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) between 3 and 40),
  is_default boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade
);
create index customer_contacts_customer_idx on public.customer_contacts (company_id, customer_id);
create unique index customer_contacts_one_default on public.customer_contacts (customer_id) where is_default;

create table public.customer_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null,
  storage_path text not null check (length(storage_path) between 1 and 300),
  photo_type public.customer_photo_type not null default 'other',
  note text check (note is null or length(note) <= 500),
  is_default boolean not null default false,
  created_by_employee_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  unique (company_id, storage_path),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, created_by_employee_id) references public.employees (company_id, id) on delete set null (created_by_employee_id)
);
create index customer_photos_customer_idx on public.customer_photos (company_id, customer_id);
create unique index customer_photos_one_default on public.customer_photos (customer_id) where is_default;

create trigger touch_customers before update on public.customers for each row execute function app.touch_updated_at();
create trigger immutable_company_customers before update on public.customers for each row execute function app.forbid_company_change();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function app.audit_row();
create trigger audit_customer_contacts after insert or update or delete on public.customer_contacts for each row execute function app.audit_row();
create trigger audit_customer_photos after insert or update or delete on public.customer_photos for each row execute function app.audit_row();

-- ---------- who sees what ----------
-- Is this customer inside the caller's scope for the given permission?
create function app.customer_in_scope(p_key text, p_owner uuid, p_created_by uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (select app.permission_scope(p_key))
    when 'company' then true
    when 'team' then p_owner in (select app.team_employee_ids()) or p_created_by in (select app.team_employee_ids())
    when 'branch' then p_branch = any (app.my_branch_ids())
    when 'own' then p_owner = (select app.my_employee_id()) or p_created_by = (select app.my_employee_id())
    else false end
$$;
revoke all on function app.customer_in_scope(text, uuid, uuid, uuid) from public, anon;
grant execute on function app.customer_in_scope(text, uuid, uuid, uuid) to authenticated;

create function app.can_read_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = app.company_id()
      and app.customer_in_scope('sales.customer.read', c.owner_employee_id, c.created_by_employee_id, c.branch_id))
$$;
revoke all on function app.can_read_customer(uuid) from public, anon;
grant execute on function app.can_read_customer(uuid) to authenticated;

alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_contacts force row level security;
alter table public.customer_photos enable row level security;
alter table public.customer_photos force row level security;

create policy customers_select on public.customers for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and app.customer_in_scope('sales.customer.read', owner_employee_id, created_by_employee_id, branch_id));
create policy customer_contacts_select on public.customer_contacts for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
create policy customer_photos_select on public.customer_photos for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
-- Read only for the app. Writes happen in the functions below.
grant select on public.customers, public.customer_contacts, public.customer_photos to authenticated;

-- ---------- photo bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('sales-attachments', 'sales-attachments', false, 3145728, array['image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/webp'];

-- Folder 1 is the company id, folder 2 the customer id. A phone may upload before the customer row exists
-- (offline), so uploading only needs the right to create or edit customers in this company.
create function app.sales_file_write(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and (app.permission_scope('sales.customer.create') is not null or app.permission_scope('sales.customer.update') is not null)
    and (string_to_array(p_name, '/'))[1] = app.company_id()::text
    and (string_to_array(p_name, '/'))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(string_to_array(p_name, '/'), 1) = 3
$$;
create function app.sales_file_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when (string_to_array(p_name, '/'))[1] = app.company_id()::text
               and (string_to_array(p_name, '/'))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and array_length(string_to_array(p_name, '/'), 1) = 3
         then app.can_read_customer(((string_to_array(p_name, '/'))[2])::uuid) else false end
$$;
revoke all on function app.sales_file_write(text), app.sales_file_read(text) from public, anon;
grant execute on function app.sales_file_write(text), app.sales_file_read(text) to authenticated;

create policy sales_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sales-attachments' and app.sales_file_write(name));
create policy sales_files_select on storage.objects for select to authenticated
  using (bucket_id = 'sales-attachments' and app.sales_file_read(name));

-- ---------- write: a customer with its contacts and photos ----------
-- p_contacts: [{name, phone, is_default}]   p_photos: [{path, type, note, is_default}]
-- Both lists are replaced as a set. Pass null to leave that list untouched.
-- p_id: pass a new uuid to create (retrying with the same id is safe), or an existing id to edit.
create function public.sales_save_customer(
  p_id uuid, p_name text, p_name_local text, p_address text, p_latitude double precision, p_longitude double precision,
  p_notes text, p_contacts jsonb, p_photos jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  gid uuid := coalesce(p_id, gen_random_uuid());
  c public.customers%rowtype;
  x jsonb;
  n integer;
  has_default boolean := false;
  default_seen boolean;
  ph text;
  pt text;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'latitude and longitude go together' using errcode = '22023'; end if;
  if p_contacts is not null and (jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) > 20) then
    raise exception 'bad contacts' using errcode = '22023'; end if;
  if p_photos is not null and (jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 40) then
    raise exception 'bad photos' using errcode = '22023'; end if;

  select * into c from public.customers where id = gid;
  if found and c.company_id <> cid then raise exception 'not allowed' using errcode = '42501'; end if;

  if not found then
    if (select app.permission_scope('sales.customer.create')) is null then raise exception 'not allowed' using errcode = '42501'; end if;
    if eid is null then raise exception 'your account is not linked to an employee' using errcode = '42501'; end if;
    insert into public.customers (id, company_id, branch_id, owner_employee_id, created_by_employee_id, client_op_id, name, name_local,
                                  address, latitude, longitude, notes)
    values (gid, cid, (select e.branch_id from public.employees e where e.id = eid and e.company_id = cid), eid, eid, gid,
            btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
            p_latitude, p_longitude, nullif(btrim(coalesce(p_notes, '')), ''));
  else
    if (select app.permission_scope('sales.customer.update')) is null
       or not app.customer_in_scope('sales.customer.update', c.owner_employee_id, c.created_by_employee_id, c.branch_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    update public.customers set name = btrim(p_name), name_local = nullif(btrim(coalesce(p_name_local, '')), ''),
      address = nullif(btrim(coalesce(p_address, '')), ''), latitude = p_latitude, longitude = p_longitude,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
    where id = gid and company_id = cid;
  end if;

  if p_contacts is not null then
    delete from public.customer_contacts where customer_id = gid and company_id = cid;
    n := 0;
    for x in select * from jsonb_array_elements(p_contacts) loop
      if length(btrim(coalesce(x ->> 'name', ''))) = 0 then raise exception 'every contact needs a name' using errcode = '22023'; end if;
      ph := nullif(btrim(coalesce(x ->> 'phone', '')), '');
      n := n + 1;
      default_seen := coalesce((x ->> 'is_default')::boolean, false) and not has_default;
      if default_seen then has_default := true; end if;
      insert into public.customer_contacts (company_id, customer_id, name, phone, is_default)
      values (cid, gid, btrim(x ->> 'name'), ph, default_seen);
    end loop;
    if n > 0 and not has_default then
      update public.customer_contacts set is_default = true
      where id = (select id from public.customer_contacts where customer_id = gid and company_id = cid order by created_at, id limit 1);
    end if;
  end if;

  if p_photos is not null then
    delete from public.customer_photos where customer_id = gid and company_id = cid
      and storage_path not in (select x2 ->> 'path' from jsonb_array_elements(p_photos) x2);
    has_default := false;
    for x in select * from jsonb_array_elements(p_photos) loop
      ph := nullif(btrim(coalesce(x ->> 'path', '')), '');
      if ph is null or (string_to_array(ph, '/'))[1] <> cid::text or (string_to_array(ph, '/'))[2] <> gid::text
         or array_length(string_to_array(ph, '/'), 1) <> 3 then
        raise exception 'picture does not belong to this customer' using errcode = '42501';
      end if;
      if not exists (select 1 from storage.objects o where o.bucket_id = 'sales-attachments' and o.name = ph) then
        raise exception 'picture was not uploaded' using errcode = '22023';
      end if;
      pt := coalesce(nullif(x ->> 'type', ''), 'other');
      default_seen := coalesce((x ->> 'is_default')::boolean, false) and not has_default;
      if default_seen then has_default := true; end if;
      -- clear the old default first so the one-default index never trips
      if default_seen then update public.customer_photos set is_default = false where customer_id = gid and company_id = cid; end if;
      insert into public.customer_photos (company_id, customer_id, storage_path, photo_type, note, is_default, created_by_employee_id)
      values (cid, gid, ph, pt::public.customer_photo_type, nullif(btrim(coalesce(x ->> 'note', '')), ''), default_seen, eid)
      on conflict (company_id, storage_path) do update set photo_type = excluded.photo_type, note = excluded.note,
        is_default = excluded.is_default;
    end loop;
  end if;
  return gid;
end $$;

create function public.sales_archive_customer(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype;
begin
  select * into c from public.customers where id = p_id and company_id = app.company_id();
  if not found or not (select app.is_active_member())
     or not app.customer_in_scope('sales.customer.manage', c.owner_employee_id, c.created_by_employee_id, c.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.customers set archived_at = case when p_archived then now() else null end where id = p_id and company_id = c.company_id;
end $$;

create function public.sales_assign_customer(p_id uuid, p_employee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; b uuid;
begin
  select * into c from public.customers where id = p_id and company_id = app.company_id();
  if not found or not (select app.is_active_member())
     or not app.customer_in_scope('sales.customer.manage', c.owner_employee_id, c.created_by_employee_id, c.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.branch_id into b from public.employees e where e.id = p_employee_id and e.company_id = c.company_id and e.status = 'active';
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  update public.customers set owner_employee_id = p_employee_id, branch_id = b where id = p_id and company_id = c.company_id;
end $$;

-- ---------- reads for the app (run as the caller, so row level security decides what is returned) ----------
create function public.sales_customer_list(p_search text, p_limit integer default 50, p_include_archived boolean default false)
returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(r order by r.name), '[]'::jsonb) from (
    select c.id, c.name, c.name_local, c.address, c.archived_at,
           (select ct.name from public.customer_contacts ct where ct.customer_id = c.id and ct.is_default) as contact_name,
           (select ct.phone from public.customer_contacts ct where ct.customer_id = c.id and ct.is_default) as contact_phone,
           (select ph.storage_path from public.customer_photos ph where ph.customer_id = c.id and ph.is_default) as photo_path
    from public.customers c
    where (p_include_archived or c.archived_at is null)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or c.name ilike '%' || btrim(p_search) || '%' or c.name_local ilike '%' || btrim(p_search) || '%'
           or c.address ilike '%' || btrim(p_search) || '%'
           or exists (select 1 from public.customer_contacts ct where ct.customer_id = c.id and ct.phone ilike '%' || btrim(p_search) || '%'))
    order by c.name
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) r
$$;

create function public.sales_customer_detail(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'name_local', c.name_local, 'address', c.address,
    'latitude', c.latitude, 'longitude', c.longitude, 'notes', c.notes, 'credit_limit_cents', c.credit_limit_cents,
    'archived_at', c.archived_at, 'owner_employee_id', c.owner_employee_id, 'created_at', c.created_at,
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('id', ct.id, 'name', ct.name, 'phone', ct.phone, 'is_default', ct.is_default)
                                           order by ct.is_default desc, ct.created_at) from public.customer_contacts ct where ct.customer_id = c.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path, 'type', ph.photo_type, 'note', ph.note,
                                                              'is_default', ph.is_default) order by ph.is_default desc, ph.created_at desc)
                        from public.customer_photos ph where ph.customer_id = c.id), '[]'::jsonb))
  from public.customers c where c.id = p_id
$$;

revoke execute on function public.sales_save_customer(uuid, text, text, text, double precision, double precision, text, jsonb, jsonb) from public, anon;
revoke execute on function public.sales_archive_customer(uuid, boolean) from public, anon;
revoke execute on function public.sales_assign_customer(uuid, uuid) from public, anon;
revoke execute on function public.sales_customer_list(text, integer, boolean) from public, anon;
revoke execute on function public.sales_customer_detail(uuid) from public, anon;
grant execute on function public.sales_save_customer(uuid, text, text, text, double precision, double precision, text, jsonb, jsonb) to authenticated;
grant execute on function public.sales_archive_customer(uuid, boolean) to authenticated;
grant execute on function public.sales_assign_customer(uuid, uuid) to authenticated;
grant execute on function public.sales_customer_list(text, integer, boolean) to authenticated;
grant execute on function public.sales_customer_detail(uuid) to authenticated;

-- ---------- what the UPLIF Go app needs to draw itself ----------
create function public.sales_my_state() returns jsonb
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
    'can_manage', (select app.permission_scope('sales.customer.manage')) is not null);
end $$;
revoke execute on function public.sales_my_state() from public, anon;
grant execute on function public.sales_my_state() to authenticated;
