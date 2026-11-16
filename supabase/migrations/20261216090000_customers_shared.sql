-- Shared customer database, Migration A (additive). Plan: plans/uplif-customer-database-plan-v1.md
-- Safe with Go (PR #72): keeps customers/customer_contacts/customer_photos columns and the sales.customer.* keys.
-- Nothing is dropped. Old keys keep working through an alias (app.customer_alias_key).

create extension if not exists pg_trgm with schema extensions;

----------------------------------------------------------------------
-- 1. Helpers
----------------------------------------------------------------------
create or replace function app.norm_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(
    translate(coalesce(p, ''), '០១២៣៤៥៦៧៨៩', '0123456789'),
    '\D', '', 'g'), '^(855)?0*', ''), '')
$$;

-- maps old sales.customer.* keys and new customers.* keys to each other (transition period)
create or replace function app.customer_alias_key(p_key text) returns text
language sql immutable set search_path = '' as $$
  select case p_key
    when 'sales.customer.read' then 'customers.customer.read'
    when 'sales.customer.create' then 'customers.customer.create'
    when 'sales.customer.update' then 'customers.customer.update'
    when 'sales.customer.manage' then 'customers.customer.archive'
    when 'customers.customer.read' then 'sales.customer.read'
    when 'customers.customer.create' then 'sales.customer.create'
    when 'customers.customer.update' then 'sales.customer.update'
    when 'customers.customer.archive' then 'sales.customer.manage'
    else null end
$$;

create or replace function app.customer_in_scope(p_key text, p_owner uuid, p_created_by uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(
    case (select app.permission_scope(k))
      when 'company' then true
      when 'team' then p_owner in (select app.team_employee_ids()) or p_created_by in (select app.team_employee_ids())
      when 'branch' then p_branch = any (app.my_branch_ids())
      when 'own' then p_owner = (select app.my_employee_id()) or p_created_by = (select app.my_employee_id())
      else false end), false)
  from unnest(array[p_key, app.customer_alias_key(p_key)]) k
  where k is not null
$$;

create or replace function app.can_read_customer_credit(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = app.company_id()
      and app.customer_in_scope('customers.credit.read', c.owner_employee_id, c.created_by_employee_id, c.branch_id))
$$;

-- same as app.audit_row but skips updates where nothing but updated_at changed
create or replace function app.audit_row_quiet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  cid uuid; details jsonb;
begin
  if app.membership_id() is null then return coalesce(new, old); end if;
  cid := (rec ->> 'company_id')::uuid;
  if cid is distinct from app.company_id() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    select jsonb_build_object('old', coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
                              'new', coalesce(jsonb_object_agg(o.key, n.value), '{}'::jsonb))
    into details
    from jsonb_each(to_jsonb(old)) o join jsonb_each(to_jsonb(new)) n using (key)
    where o.value is distinct from n.value and o.key not in ('updated_at', 'search_text');
    if details -> 'new' = '{}'::jsonb then return new; end if;
  else
    details := jsonb_build_object('row', rec);
  end if;
  perform app.write_audit(cid, app.membership_id(), tg_table_name || '.' || lower(tg_op), tg_table_name, (rec ->> 'id')::uuid, details);
  return coalesce(new, old);
end $$;

----------------------------------------------------------------------
-- 2. Permission keys (copy grants from sales.customer.*)
----------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('customers.customer.read', 'See customers'),
  ('customers.customer.create', 'Register new customers'),
  ('customers.customer.update', 'Edit customers, contacts and pictures'),
  ('customers.customer.archive', 'Archive and restore customers'),
  ('customers.customer.assign', 'Assign salespeople to customers'),
  ('customers.customer.merge', 'Merge duplicate customers'),
  ('customers.customer.import', 'Import customers from a file'),
  ('customers.customer.export', 'Export customers to a file'),
  ('customers.credit.read', 'See credit limit and payment terms'),
  ('customers.credit.update', 'Change credit limit, payment terms and credit hold'),
  ('customers.group.manage', 'Manage customer groups'),
  ('customers.field.manage', 'Manage custom customer fields'),
  ('customers.address.manage', 'Edit customer addresses')
on conflict (key) do nothing;

with map(old_key, new_key) as (values
  ('sales.customer.read', 'customers.customer.read'),
  ('sales.customer.create', 'customers.customer.create'),
  ('sales.customer.update', 'customers.customer.update'),
  ('sales.customer.update', 'customers.address.manage'),
  ('sales.customer.manage', 'customers.customer.archive'),
  ('sales.customer.manage', 'customers.customer.assign'),
  ('sales.customer.manage', 'customers.customer.merge'),
  ('sales.customer.manage', 'customers.customer.import'),
  ('sales.customer.manage', 'customers.customer.export'),
  ('sales.customer.manage', 'customers.credit.read'),
  ('sales.customer.manage', 'customers.credit.update'),
  ('sales.customer.manage', 'customers.group.manage'),
  ('sales.customer.manage', 'customers.field.manage'))
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select rp.company_id, rp.role_id, map.new_key, rp.data_scope
from public.role_permissions rp join map on map.old_key = rp.permission_key
on conflict do nothing;

----------------------------------------------------------------------
-- 3. New lookup tables
----------------------------------------------------------------------
create table public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  default_discount_pct numeric(5,2) check (default_discount_pct between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, name)
);

create table public.customer_photo_statuses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, name)
);

create table public.customer_field_defs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null default 'customer' check (entity = 'customer'),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(btrim(label)) > 0),
  label_local text,
  type text not null check (type in ('text','number','date','yes_no','single_choice','multi_choice')),
  required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  show_in_list boolean not null default false,
  filterable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, entity, key)
);

create table public.customer_field_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  field_id uuid not null,
  key text not null check (key ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
  label text not null check (length(btrim(label)) > 0),
  label_local text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id), unique (field_id, key),
  foreign key (company_id, field_id) references public.customer_field_defs (company_id, id) on delete cascade
);

----------------------------------------------------------------------
-- 4. customers: new columns
----------------------------------------------------------------------
alter table public.customers
  add column code text,
  add column type text not null default 'business' check (type in ('business','person')),
  add column status text not null default 'active' check (status in ('active','blocked','archived')),
  add column group_id uuid,
  add column default_currency text check (default_currency is null or length(default_currency) = 3),
  add column tax_id text,
  add column tax_id_type text,
  add column legal_name text,
  add column legal_name_local text,
  add column email text,
  add column website text,
  add column phone_primary text,
  add column phone_secondary text,
  add column merged_into_id uuid,
  add column supplier_id uuid,
  add column source text not null default 'manual' check (source in ('manual','go','orders','pos','import','portal')),
  add column search_text text not null default '';

alter table public.customers
  add constraint customers_group_fk foreign key (company_id, group_id) references public.customer_groups (company_id, id),
  add constraint customers_merged_fk foreign key (company_id, merged_into_id) references public.customers (company_id, id),
  add constraint customers_supplier_fk foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  add constraint customers_not_self_merged check (merged_into_id is null or merged_into_id <> id);

create unique index customers_company_code_key on public.customers (company_id, code) where code is not null;
create index customers_list_idx on public.customers (company_id, status, updated_at, id);
create index customers_branch_idx on public.customers (company_id, branch_id);
create index customers_group_idx on public.customers (company_id, group_id) where group_id is not null;
create index customers_tax_idx on public.customers (company_id, tax_id) where tax_id is not null;
create index customers_search_trgm on public.customers using gin (search_text extensions.gin_trgm_ops);

create table public.customer_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_no integer not null default 0
);

create or replace function app.customers_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_op = 'INSERT' and new.code is null then
    insert into public.customer_counters (company_id, next_no) values (new.company_id, 1)
    on conflict (company_id) do update set next_no = public.customer_counters.next_no + 1
    returning next_no into n;
    new.code := 'C' || lpad(n::text, 5, '0');
  end if;
  -- keep status and archived_at in step
  if tg_op = 'INSERT' then
    if new.archived_at is not null then new.status := 'archived';
    elsif new.status = 'archived' then new.archived_at := now(); end if;
  else
    if new.archived_at is distinct from old.archived_at then
      new.status := case when new.archived_at is not null then 'archived'
                         when new.status = 'archived' then 'active' else new.status end;
    elsif new.status is distinct from old.status then
      if new.status = 'archived' and new.archived_at is null then new.archived_at := now();
      elsif new.status <> 'archived' then new.archived_at := null; end if;
    end if;
  end if;
  new.search_text := lower(concat_ws(' ', new.code, new.name, new.name_local, new.legal_name, new.legal_name_local,
                                     new.phone_primary, new.phone_secondary, new.email, new.tax_id));
  return new;
end $$;
create trigger customers_before_write before insert or update on public.customers
  for each row execute function app.customers_before_write();

----------------------------------------------------------------------
-- 5. Child tables
----------------------------------------------------------------------
-- credit (one row per customer, own permission)
create table public.customer_credit_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null unique,
  credit_enabled boolean not null default false,
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  currency text check (currency is null or length(currency) = 3),
  payment_term_id uuid,
  on_hold boolean not null default false,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, payment_term_id) references public.payment_terms (company_id, id)
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  label text,
  kind text not null default 'main' check (kind in ('main','billing','delivery')),
  address text,
  address_local text,
  province text,
  district text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  is_default boolean not null default false,
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  unique (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade
);
create index customer_addresses_customer_idx on public.customer_addresses (company_id, customer_id);
create unique index customer_addresses_one_default on public.customer_addresses (customer_id) where is_default and archived_at is null;

-- many reps per customer; owner_employee_id stays as the primary rep
create table public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  employee_id uuid not null,
  role text,
  is_primary boolean not null default false,
  from_date date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);
create index customer_assignments_customer_idx on public.customer_assignments (company_id, customer_id);
create index customer_assignments_employee_idx on public.customer_assignments (company_id, employee_id) where ended_at is null;
create unique index customer_assignments_one_primary on public.customer_assignments (customer_id) where is_primary and ended_at is null;
create unique index customer_assignments_one_active on public.customer_assignments (customer_id, employee_id) where ended_at is null;

-- assigned reps (customer_assignments) can read the customer if they have read permission at all
create or replace function app.customer_assigned_to_me(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.customer_assignments a
    where a.customer_id = p_customer and a.company_id = app.company_id()
      and a.employee_id = (select app.my_employee_id()) and a.ended_at is null)
    and ((select app.permission_scope('sales.customer.read')) is not null
         or (select app.permission_scope('customers.customer.read')) is not null)
$$;

create or replace function app.can_read_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = app.company_id()
      and (app.customer_in_scope('sales.customer.read', c.owner_employee_id, c.created_by_employee_id, c.branch_id)
           or app.customer_assigned_to_me(c.id)))
$$;


-- channels: each contact has many (phone, telegram, facebook), one default
create table public.customer_contact_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  contact_id uuid not null,
  type text not null check (type in ('phone','telegram','facebook')),
  value text not null check (length(btrim(value)) > 0 and length(value) <= 300),
  phone_normalized text,
  is_default boolean not null default false,
  from_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, contact_id) references public.customer_contacts (company_id, id) on delete cascade
);
create index customer_channels_customer_idx on public.customer_contact_channels (company_id, customer_id);
create index customer_channels_contact_idx on public.customer_contact_channels (contact_id);
create index customer_channels_phone_idx on public.customer_contact_channels (company_id, phone_normalized) where phone_normalized is not null;
create unique index customer_channels_one_default on public.customer_contact_channels (contact_id) where is_default;

-- pictures: caption, status, default
alter table public.customer_photos
  add column caption text,
  add column caption_local text,
  add column status_id uuid,
  add column sort_order integer not null default 0,
  add column archived_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint customer_photos_status_fk foreign key (company_id, status_id) references public.customer_photo_statuses (company_id, id);

-- custom field values (typed columns; multi choice = several rows)
create table public.customer_field_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  field_id uuid not null,
  option_id uuid,
  value_text text,
  value_number numeric,
  value_date date,
  value_bool boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, field_id) references public.customer_field_defs (company_id, id) on delete cascade,
  foreign key (company_id, option_id) references public.customer_field_options (company_id, id)
);
create unique index customer_field_values_key on public.customer_field_values
  (customer_id, field_id, coalesce(option_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index customer_field_values_filter_idx on public.customer_field_values (company_id, field_id, option_id);

create table public.customer_merges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  from_customer_id uuid not null,
  into_customer_id uuid not null,
  merged_by_membership_id uuid,
  merged_at timestamptz not null default now(),
  moved jsonb not null default '{}'::jsonb,
  undo_until timestamptz,
  foreign key (company_id, from_customer_id) references public.customers (company_id, id) on delete cascade,
  foreign key (company_id, into_customer_id) references public.customers (company_id, id) on delete cascade
);

-- every table that points at a customer must be listed here so merge moves it
create table public.customer_refs (
  table_name text primary key,
  column_name text not null default 'customer_id',
  note text
);
insert into public.customer_refs (table_name, note) values
  ('customer_contacts', 'moved on merge'), ('customer_contact_channels', 'moved on merge'),
  ('customer_addresses', 'moved on merge'), ('customer_photos', 'moved on merge'),
  ('customer_assignments', 'moved on merge'), ('customer_field_values', 'merge keeps target values, copies missing'),
  ('customer_credit_terms', 'merge keeps the higher limit unless chosen');

----------------------------------------------------------------------
-- 6. Triggers: validation, sync, touch parent, immutability, audit
----------------------------------------------------------------------
create or replace function app.refresh_customer_phones(p_customer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare dc uuid; p1 text; p2 text;
begin
  select id into dc from public.customer_contacts where customer_id = p_customer and is_default limit 1;
  if dc is null then
    select id into dc from public.customer_contacts where customer_id = p_customer order by created_at, id limit 1;
  end if;
  select max(value) filter (where rn = 1), max(value) filter (where rn = 2) into p1, p2
  from (select value, row_number() over (order by is_default desc, created_at, id) rn
        from public.customer_contact_channels where contact_id = dc and type = 'phone') s;
  update public.customers set phone_primary = p1, phone_secondary = p2
  where id = p_customer and (phone_primary, phone_secondary) is distinct from (p1, p2);
end $$;

create or replace function app.channels_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.value := btrim(new.value);
  new.phone_normalized := case when new.type = 'phone' then app.norm_phone(new.value) end;
  if not exists (select 1 from public.customer_contacts c
                 where c.id = new.contact_id and c.company_id = new.company_id and c.customer_id = new.customer_id) then
    raise exception 'contact does not belong to this customer' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger customer_channels_before_write before insert or update on public.customer_contact_channels
  for each row execute function app.channels_before_write();

create or replace function app.channels_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.refresh_customer_phones(coalesce(new.customer_id, old.customer_id));
  return null;
end $$;
create trigger customer_channels_after_write after insert or update or delete on public.customer_contact_channels
  for each row execute function app.channels_after_write();

-- Go still writes customer_contacts.phone: mirror it as a phone channel
create or replace function app.contact_phone_mirror() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform app.refresh_customer_phones(old.customer_id);
    return null;
  end if;
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    delete from public.customer_contact_channels where contact_id = new.id and from_legacy;
    if nullif(btrim(coalesce(new.phone, '')), '') is not null then
      insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default, from_legacy)
      values (new.company_id, new.customer_id, new.id, 'phone', btrim(new.phone),
              not exists (select 1 from public.customer_contact_channels where contact_id = new.id and is_default), true);
    end if;
  end if;
  perform app.refresh_customer_phones(new.customer_id);
  return null;
end $$;
create trigger customer_contacts_phone_mirror after insert or update of phone, is_default or delete on public.customer_contacts
  for each row execute function app.contact_phone_mirror();

-- owner_employee_id stays the primary rep: keep customer_assignments in step
create or replace function app.sync_owner_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_employee_id is null then
    update public.customer_assignments set ended_at = current_date
    where customer_id = new.id and is_primary and ended_at is null;
    return null;
  end if;
  if exists (select 1 from public.customer_assignments where customer_id = new.id and is_primary
             and ended_at is null and employee_id = new.owner_employee_id) then
    return null;
  end if;
  update public.customer_assignments set ended_at = current_date, is_primary = false
  where customer_id = new.id and is_primary and ended_at is null;
  update public.customer_assignments set is_primary = true
  where customer_id = new.id and employee_id = new.owner_employee_id and ended_at is null;
  if not found then
    insert into public.customer_assignments (company_id, customer_id, employee_id, role, is_primary)
    values (new.company_id, new.id, new.owner_employee_id, 'primary', true);
  end if;
  return null;
end $$;
create trigger customers_sync_owner after insert or update of owner_employee_id on public.customers
  for each row execute function app.sync_owner_assignment();

create or replace function app.touch_customer_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.customers set updated_at = now() where id = coalesce(new.customer_id, old.customer_id);
  return null;
end $$;

create or replace function app.field_values_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.customer_field_defs%rowtype; o public.customer_field_options%rowtype;
begin
  select * into d from public.customer_field_defs where id = new.field_id and company_id = new.company_id;
  if not found or not d.is_active then raise exception 'unknown field' using errcode = '23514'; end if;
  if d.type in ('single_choice','multi_choice') then
    if new.option_id is null then raise exception 'choose an option' using errcode = '23514'; end if;
    select * into o from public.customer_field_options where id = new.option_id and company_id = new.company_id;
    if not found or o.field_id <> d.id then raise exception 'option is not part of this field' using errcode = '23514'; end if;
    if tg_op = 'INSERT' and not o.is_active then raise exception 'option is not active' using errcode = '23514'; end if;
    if d.type = 'single_choice' and exists (select 1 from public.customer_field_values v
        where v.customer_id = new.customer_id and v.field_id = new.field_id and v.id <> new.id) then
      raise exception 'only one value allowed' using errcode = '23514';
    end if;
    if new.value_text is not null or new.value_number is not null or new.value_date is not null or new.value_bool is not null then
      raise exception 'choice fields only use the option' using errcode = '23514'; end if;
  else
    if new.option_id is not null then raise exception 'this field has no options' using errcode = '23514'; end if;
    if exists (select 1 from public.customer_field_values v
        where v.customer_id = new.customer_id and v.field_id = new.field_id and v.id <> new.id) then
      raise exception 'only one value allowed' using errcode = '23514';
    end if;
    if (case d.type when 'text' then new.value_text is not null and new.value_number is null and new.value_date is null and new.value_bool is null
                    when 'number' then new.value_number is not null and new.value_text is null and new.value_date is null and new.value_bool is null
                    when 'date' then new.value_date is not null and new.value_text is null and new.value_number is null and new.value_bool is null
                    when 'yes_no' then new.value_bool is not null and new.value_text is null and new.value_number is null and new.value_date is null
                    else false end) is not true then
      raise exception 'value does not match field type' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger customer_field_values_check before insert or update on public.customer_field_values
  for each row execute function app.field_values_check();

create or replace function app.field_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'customer_field_defs' then
    if (select count(*) from public.customer_field_defs where company_id = new.company_id and is_active) >= 20 then
      raise exception 'limit of 20 custom fields reached' using errcode = '53400'; end if;
  else
    if (select count(*) from public.customer_field_options where field_id = new.field_id and is_active) >= 50 then
      raise exception 'limit of 50 options per field reached' using errcode = '53400'; end if;
  end if;
  return new;
end $$;
create trigger customer_field_defs_limit before insert on public.customer_field_defs
  for each row execute function app.field_limits();
create trigger customer_field_options_limit before insert on public.customer_field_options
  for each row execute function app.field_limits();

-- per-table: updated_at, company immutability, audit, parent touch
do $$
declare t text;
begin
  foreach t in array array['customer_groups','customer_photo_statuses','customer_field_defs','customer_field_options',
    'customer_credit_terms','customer_addresses','customer_assignments','customer_contact_channels',
    'customer_field_values','customer_photos'] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['customer_groups','customer_photo_statuses','customer_field_defs','customer_field_options',
    'customer_credit_terms','customer_addresses','customer_assignments','customer_contact_channels',
    'customer_field_values','customer_merges'] loop
    execute format('create trigger immutable_company_%1$s before update on public.%1$s for each row execute function app.forbid_company_change()', t);
  end loop;
  foreach t in array array['customer_groups','customer_photo_statuses','customer_field_defs','customer_field_options',
    'customer_credit_terms','customer_addresses','customer_assignments','customer_contact_channels',
    'customer_field_values','customer_merges'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function app.audit_row_quiet()', t);
  end loop;
  foreach t in array array['customer_contacts','customer_contact_channels','customer_addresses','customer_photos',
    'customer_field_values','customer_assignments'] loop
    execute format('create trigger touch_parent_%1$s after insert or update or delete on public.%1$s for each row execute function app.touch_customer_parent()', t);
  end loop;
end $$;

-- quiet audit on the three Go tables too
drop trigger audit_customers on public.customers;
drop trigger audit_customer_contacts on public.customer_contacts;
drop trigger audit_customer_photos on public.customer_photos;
create trigger audit_customers after insert or update or delete on public.customers for each row execute function app.audit_row_quiet();
create trigger audit_customer_contacts after insert or update or delete on public.customer_contacts for each row execute function app.audit_row_quiet();
create trigger audit_customer_photos after insert or update or delete on public.customer_photos for each row execute function app.audit_row_quiet();

----------------------------------------------------------------------
-- 7. RLS (read only; all writes go through functions)
----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['customer_groups','customer_photo_statuses','customer_field_defs','customer_field_options',
    'customer_credit_terms','customer_addresses','customer_assignments','customer_contact_channels',
    'customer_field_values','customer_merges','customer_counters','customer_refs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['customer_groups','customer_photo_statuses','customer_field_defs','customer_field_options',
    'customer_credit_terms','customer_addresses','customer_assignments','customer_contact_channels',
    'customer_field_values','customer_merges'] loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- configuration lists: any active member of the company
create policy customer_groups_select on public.customer_groups for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy customer_photo_statuses_select on public.customer_photo_statuses for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy customer_field_defs_select on public.customer_field_defs for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
create policy customer_field_options_select on public.customer_field_options for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member()));
-- per-customer data: same rule as the customer row
create policy customer_addresses_select on public.customer_addresses for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
create policy customer_assignments_select on public.customer_assignments for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
create policy customer_contact_channels_select on public.customer_contact_channels for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
create policy customer_field_values_select on public.customer_field_values for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer(customer_id));
-- credit: needs its own permission
create policy customer_credit_terms_select on public.customer_credit_terms for select to authenticated
  using (company_id = (select app.company_id()) and app.can_read_customer_credit(customer_id));
-- merge log: only people who may merge
create policy customer_merges_select on public.customer_merges for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('customers.customer.merge')) is not null);

-- assigned reps also see the customer row and its contacts/photos
alter policy customers_select on public.customers using (
  company_id = (select app.company_id()) and (select app.is_active_member())
  and (app.customer_in_scope('sales.customer.read', owner_employee_id, created_by_employee_id, branch_id)
       or app.customer_assigned_to_me(id)));

----------------------------------------------------------------------
-- 8. Defaults for companies, backfill
----------------------------------------------------------------------
create or replace function app.seed_customer_defaults(p_company uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.customer_photo_statuses (company_id, name, color, sort_order) values
    (p_company, 'Before', '#64748B', 1), (p_company, 'After', '#2563EB', 2),
    (p_company, 'Approved', '#16A34A', 3), (p_company, 'Problem', '#DC2626', 4)
  on conflict do nothing
$$;
create or replace function app.companies_seed_customers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform app.seed_customer_defaults(new.id); return null; end $$;
create trigger companies_seed_customers after insert on public.companies
  for each row execute function app.companies_seed_customers();
select app.seed_customer_defaults(id) from public.companies;

insert into public.customer_assignments (company_id, customer_id, employee_id, role, is_primary)
select company_id, id, owner_employee_id, 'primary', true from public.customers where owner_employee_id is not null
on conflict do nothing;
insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default, from_legacy)
select company_id, customer_id, id, 'phone', btrim(phone), true, true from public.customer_contacts
where nullif(btrim(coalesce(phone, '')), '') is not null on conflict do nothing;

----------------------------------------------------------------------
-- 9. Read functions (RLS applies: security invoker)
----------------------------------------------------------------------
create or replace function public.customers_search(p_q text, p_limit integer default 30)
returns table (id uuid, code text, name text, name_local text, phone_primary text, status text)
language sql stable set search_path = '' as $$
  select c.id, c.code, c.name, c.name_local, c.phone_primary, c.status
  from public.customers c
  where c.company_id = app.company_id() and c.merged_into_id is null and c.status <> 'archived'
    and (length(btrim(coalesce(p_q, ''))) = 0
         or c.search_text like '%' || replace(replace(replace(lower(btrim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or exists (select 1 from public.customer_contact_channels ch where ch.customer_id = c.id
                    and ch.phone_normalized is not null and ch.phone_normalized = app.norm_phone(p_q)))
  order by (lower(c.code) = lower(btrim(coalesce(p_q, ''))) or c.phone_primary = btrim(coalesce(p_q, ''))) desc, c.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

create or replace function public.customers_find_duplicates(p_name text, p_phone text, p_tax_id text, p_exclude uuid default null)
returns table (id uuid, code text, name text, reason text)
language sql stable set search_path = '' as $$
  select c.id, c.code, c.name, 'tax_id'::text from public.customers c
   where c.company_id = app.company_id() and c.merged_into_id is null and nullif(btrim(coalesce(p_tax_id, '')), '') is not null
     and c.tax_id = btrim(p_tax_id) and c.id is distinct from p_exclude
  union
  select c.id, c.code, c.name, 'phone' from public.customers c
   where c.company_id = app.company_id() and c.merged_into_id is null and app.norm_phone(p_phone) is not null
     and c.id is distinct from p_exclude
     and exists (select 1 from public.customer_contact_channels ch where ch.customer_id = c.id
                 and ch.phone_normalized = app.norm_phone(p_phone))
  union
  select c.id, c.code, c.name, 'name' from public.customers c
   where c.company_id = app.company_id() and c.merged_into_id is null and length(btrim(coalesce(p_name, ''))) >= 3
     and c.id is distinct from p_exclude
     and (lower(c.name) = lower(btrim(p_name)) or lower(coalesce(c.name_local, '')) = lower(btrim(p_name)))
$$;

revoke all on function public.customers_search(text, integer) from public, anon;
revoke all on function public.customers_find_duplicates(text, text, text, uuid) from public, anon;
grant execute on function public.customers_search(text, integer) to authenticated;
grant execute on function public.customers_find_duplicates(text, text, text, uuid) to authenticated;
