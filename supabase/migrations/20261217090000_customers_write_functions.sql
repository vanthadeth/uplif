-- Shared customer database, Migration B: write functions, merge, import, default roles.
-- Additive. Does not touch Go's functions (sales_save_customer etc.). Needs Migration A (20261216090000).

alter table public.customers add column import_batch_id uuid;
create index customers_import_batch_idx on public.customers (import_batch_id) where import_batch_id is not null;

create table public.customer_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by_membership_id uuid,
  file_name text,
  mode text not null,
  total integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
alter table public.customers
  add constraint customers_import_batch_fk foreign key (company_id, import_batch_id)
  references public.customer_import_batches (company_id, id);
alter table public.customer_import_batches enable row level security;
revoke all on public.customer_import_batches from anon, authenticated;
grant select on public.customer_import_batches to authenticated;
create policy customer_import_batches_select on public.customer_import_batches for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('customers.customer.import')) is not null);
create trigger audit_customer_import_batches after insert or update or delete on public.customer_import_batches
  for each row execute function app.audit_row_quiet();

-- Go still writes customer_contacts.phone: do not duplicate a phone that already has a real channel
create or replace function app.contact_phone_mirror() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform app.refresh_customer_phones(old.customer_id);
    return null;
  end if;
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    delete from public.customer_contact_channels where contact_id = new.id and from_legacy;
    if nullif(btrim(coalesce(new.phone, '')), '') is not null
       and not exists (select 1 from public.customer_contact_channels
                       where contact_id = new.id and type = 'phone' and not from_legacy
                         and phone_normalized = app.norm_phone(new.phone)) then
      insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default, from_legacy)
      values (new.company_id, new.customer_id, new.id, 'phone', btrim(new.phone),
              not exists (select 1 from public.customer_contact_channels where contact_id = new.id and is_default), true);
    end if;
  end if;
  perform app.refresh_customer_phones(new.customer_id);
  return null;
end $$;

-- guard: lock a customer and check permission + scope
create or replace function app.customer_guard(p_customer uuid, p_key text) returns public.customers
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.customers where id = p_customer and company_id = app.company_id() for update;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (app.customer_in_scope(p_key, c.owner_employee_id, c.created_by_employee_id, c.branch_id)
          or (p_key in ('customers.customer.update', 'customers.address.manage')
              and app.customer_assigned_to_me(c.id)
              and (select app.permission_scope(p_key)) is not null)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return c;
end $$;

create or replace function app.require_permission(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope(p_key)) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- create a customer (quick add, any app). Idempotent by id.
create or replace function public.customers_create(p_id uuid, p_name text, p_name_local text default null,
  p_phone text default null, p_source text default 'manual') returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_employee_id();
  gid uuid := coalesce(p_id, gen_random_uuid()); ex public.customers%rowtype;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if (select app.permission_scope('customers.customer.create')) is null
     and (select app.permission_scope('sales.customer.create')) is null then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if p_source not in ('manual','go','orders','pos','import','portal') then
    raise exception 'bad source' using errcode = '22023'; end if;
  select * into ex from public.customers where id = gid;
  if found then
    if ex.company_id <> cid then raise exception 'not allowed' using errcode = '42501'; end if;
    return gid;
  end if;
  insert into public.customers (id, company_id, branch_id, owner_employee_id, created_by_employee_id, client_op_id, name, name_local, source)
  values (gid, cid, (select e.branch_id from public.employees e where e.id = eid and e.company_id = cid), eid, eid, gid,
          btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), p_source);
  if nullif(btrim(coalesce(p_phone, '')), '') is not null then
    insert into public.customer_contacts (company_id, customer_id, name, phone, is_default)
    values (cid, gid, btrim(p_name), btrim(p_phone), true);
  end if;
  return gid;
end $$;

-- profile fields (patch: only keys present are changed)
create or replace function public.customers_save_profile(p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; cid uuid := app.company_id(); st text;
begin
  c := app.customer_guard(p_id, 'customers.customer.update');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch' using errcode = '22023'; end if;
  if p_patch ? 'name' and length(btrim(coalesce(p_patch ->> 'name', ''))) = 0 then
    raise exception 'name is required' using errcode = '22023'; end if;
  if p_patch ? 'email' and nullif(btrim(coalesce(p_patch ->> 'email', '')), '') is not null
     and (p_patch ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'check the email address' using errcode = '22023'; end if;
  if p_patch ? 'status' then
    st := p_patch ->> 'status';
    if st not in ('active', 'blocked') then raise exception 'use archive to archive' using errcode = '22023'; end if;
    perform app.customer_guard(p_id, 'customers.credit.update');
  end if;
  if p_patch ? 'group_id' and nullif(p_patch ->> 'group_id', '') is not null
     and not exists (select 1 from public.customer_groups g where g.id = (p_patch ->> 'group_id')::uuid and g.company_id = cid) then
    raise exception 'group not found' using errcode = '22023'; end if;
  update public.customers set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    name_local = case when p_patch ? 'name_local' then nullif(btrim(coalesce(p_patch ->> 'name_local', '')), '') else name_local end,
    type = case when p_patch ? 'type' then p_patch ->> 'type' else type end,
    group_id = case when p_patch ? 'group_id' then nullif(p_patch ->> 'group_id', '')::uuid else group_id end,
    default_currency = case when p_patch ? 'default_currency' then nullif(upper(btrim(coalesce(p_patch ->> 'default_currency', ''))), '') else default_currency end,
    tax_id = case when p_patch ? 'tax_id' then nullif(btrim(coalesce(p_patch ->> 'tax_id', '')), '') else tax_id end,
    tax_id_type = case when p_patch ? 'tax_id_type' then nullif(btrim(coalesce(p_patch ->> 'tax_id_type', '')), '') else tax_id_type end,
    legal_name = case when p_patch ? 'legal_name' then nullif(btrim(coalesce(p_patch ->> 'legal_name', '')), '') else legal_name end,
    legal_name_local = case when p_patch ? 'legal_name_local' then nullif(btrim(coalesce(p_patch ->> 'legal_name_local', '')), '') else legal_name_local end,
    email = case when p_patch ? 'email' then nullif(btrim(coalesce(p_patch ->> 'email', '')), '') else email end,
    website = case when p_patch ? 'website' then nullif(btrim(coalesce(p_patch ->> 'website', '')), '') else website end,
    notes = case when p_patch ? 'notes' then nullif(btrim(coalesce(p_patch ->> 'notes', '')), '') else notes end,
    supplier_id = case when p_patch ? 'supplier_id' then nullif(p_patch ->> 'supplier_id', '')::uuid else supplier_id end,
    status = case when p_patch ? 'status' and status <> 'archived' then p_patch ->> 'status' else status end
  where id = p_id and company_id = cid;
end $$;

create or replace function public.customers_archive(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype;
begin
  c := app.customer_guard(p_id, 'customers.customer.archive');
  update public.customers set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_id and company_id = c.company_id;
end $$;

-- contacts and channels (replace the whole list)
-- p_contacts: [{id?, name, is_default, channels: [{id?, type, value, is_default}]}]
create or replace function public.customers_save_contacts(p_customer uuid, p_contacts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers%rowtype; cid uuid := app.company_id();
  x jsonb; y jsonb; kid uuid; chid uuid; keep_contacts uuid[] := '{}'; keep_channels uuid[];
  default_contact uuid; default_channel uuid; first_contact uuid; first_channel uuid; first_phone text;
begin
  c := app.customer_guard(p_customer, 'customers.customer.update');
  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) > 20 then
    raise exception 'bad contacts' using errcode = '22023'; end if;

  update public.customer_contacts set is_default = false where customer_id = p_customer and company_id = cid and is_default;
  update public.customer_contact_channels set is_default = false where customer_id = p_customer and company_id = cid and is_default;

  delete from public.customer_contacts
  where customer_id = p_customer and company_id = cid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(p_contacts) e where nullif(e ->> 'id', '') is not null);

  for x in select * from jsonb_array_elements(p_contacts) loop
    if length(btrim(coalesce(x ->> 'name', ''))) = 0 then raise exception 'every contact needs a name' using errcode = '22023'; end if;
    if x -> 'channels' is not null and (jsonb_typeof(x -> 'channels') <> 'array' or jsonb_array_length(x -> 'channels') > 10) then
      raise exception 'bad channels' using errcode = '22023'; end if;
    kid := nullif(x ->> 'id', '')::uuid;
    if kid is not null and exists (select 1 from public.customer_contacts where id = kid and customer_id = p_customer and company_id = cid) then
      update public.customer_contacts set name = btrim(x ->> 'name') where id = kid;
    else
      insert into public.customer_contacts (id, company_id, customer_id, name, is_default)
      values (coalesce(kid, gen_random_uuid()), cid, p_customer, btrim(x ->> 'name'), false) returning id into kid;
    end if;
    keep_contacts := keep_contacts || kid;
    first_contact := coalesce(first_contact, kid);
    if coalesce((x ->> 'is_default')::boolean, false) and default_contact is null then default_contact := kid; end if;

    keep_channels := '{}'; default_channel := null; first_channel := null; first_phone := null;
    delete from public.customer_contact_channels
    where contact_id = kid and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(x -> 'channels', '[]'::jsonb)) e
                                          where nullif(e ->> 'id', '') is not null);
    for y in select * from jsonb_array_elements(coalesce(x -> 'channels', '[]'::jsonb)) loop
      if (y ->> 'type') not in ('phone', 'telegram', 'facebook') then raise exception 'channel type must be phone, telegram or facebook' using errcode = '22023'; end if;
      if length(btrim(coalesce(y ->> 'value', ''))) = 0 then raise exception 'every channel needs a number or link' using errcode = '22023'; end if;
      chid := nullif(y ->> 'id', '')::uuid;
      if chid is not null and exists (select 1 from public.customer_contact_channels where id = chid and contact_id = kid) then
        update public.customer_contact_channels set type = y ->> 'type', value = y ->> 'value', from_legacy = false where id = chid;
      else
        insert into public.customer_contact_channels (id, company_id, customer_id, contact_id, type, value)
        values (coalesce(chid, gen_random_uuid()), cid, p_customer, kid, y ->> 'type', y ->> 'value') returning id into chid;
      end if;
      first_channel := coalesce(first_channel, chid);
      if (y ->> 'type') = 'phone' and first_phone is null then first_phone := btrim(y ->> 'value'); end if;
      if coalesce((y ->> 'is_default')::boolean, false) and default_channel is null then default_channel := chid; end if;
    end loop;
    default_channel := coalesce(default_channel, first_channel);
    if default_channel is not null then
      update public.customer_contact_channels set is_default = true where id = default_channel;
    end if;
    update public.customer_contacts set phone = first_phone where id = kid and phone is distinct from first_phone;
  end loop;

  default_contact := coalesce(default_contact, first_contact);
  if default_contact is not null then
    update public.customer_contacts set is_default = true where id = default_contact;
  end if;
  perform app.refresh_customer_phones(p_customer);
end $$;

-- addresses (replace; removed ones are archived, not deleted)
create or replace function public.customers_save_addresses(p_customer uuid, p_addresses jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers%rowtype; cid uuid := app.company_id(); x jsonb; aid uuid;
  default_addr uuid; first_addr uuid; d public.customer_addresses%rowtype;
begin
  c := app.customer_guard(p_customer, 'customers.address.manage');
  if p_addresses is null or jsonb_typeof(p_addresses) <> 'array' or jsonb_array_length(p_addresses) > 20 then
    raise exception 'bad addresses' using errcode = '22023'; end if;
  update public.customer_addresses set is_default = false where customer_id = p_customer and company_id = cid and is_default;
  update public.customer_addresses set archived_at = coalesce(archived_at, now())
  where customer_id = p_customer and company_id = cid and archived_at is null
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(p_addresses) e where nullif(e ->> 'id', '') is not null);
  for x in select * from jsonb_array_elements(p_addresses) loop
    if (x ->> 'latitude' is null) <> (x ->> 'longitude' is null) then
      raise exception 'latitude and longitude go together' using errcode = '22023'; end if;
    aid := nullif(x ->> 'id', '')::uuid;
    if aid is not null and exists (select 1 from public.customer_addresses where id = aid and customer_id = p_customer and company_id = cid) then
      update public.customer_addresses set
        label = nullif(btrim(coalesce(x ->> 'label', '')), ''), kind = coalesce(nullif(x ->> 'kind', ''), 'main'),
        address = nullif(btrim(coalesce(x ->> 'address', '')), ''), address_local = nullif(btrim(coalesce(x ->> 'address_local', '')), ''),
        province = nullif(btrim(coalesce(x ->> 'province', '')), ''), district = nullif(btrim(coalesce(x ->> 'district', '')), ''),
        latitude = (x ->> 'latitude')::double precision, longitude = (x ->> 'longitude')::double precision,
        note = nullif(btrim(coalesce(x ->> 'note', '')), ''), archived_at = null
      where id = aid;
    else
      insert into public.customer_addresses (id, company_id, customer_id, label, kind, address, address_local, province, district, latitude, longitude, note)
      values (coalesce(aid, gen_random_uuid()), cid, p_customer, nullif(btrim(coalesce(x ->> 'label', '')), ''),
              coalesce(nullif(x ->> 'kind', ''), 'main'), nullif(btrim(coalesce(x ->> 'address', '')), ''),
              nullif(btrim(coalesce(x ->> 'address_local', '')), ''), nullif(btrim(coalesce(x ->> 'province', '')), ''),
              nullif(btrim(coalesce(x ->> 'district', '')), ''), (x ->> 'latitude')::double precision,
              (x ->> 'longitude')::double precision, nullif(btrim(coalesce(x ->> 'note', '')), ''))
      returning id into aid;
    end if;
    first_addr := coalesce(first_addr, aid);
    if coalesce((x ->> 'is_default')::boolean, false) and default_addr is null then default_addr := aid; end if;
  end loop;
  default_addr := coalesce(default_addr, first_addr);
  if default_addr is not null then
    update public.customer_addresses set is_default = true where id = default_addr;
    select * into d from public.customer_addresses where id = default_addr;
    update public.customers set address = coalesce(d.address, d.address_local), latitude = d.latitude, longitude = d.longitude
    where id = p_customer and company_id = cid;
  end if;
end $$;

-- picture details: caption, caption_local, status_id, is_default, sort_order, archived
create or replace function public.customers_update_photo(p_photo uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare ph public.customer_photos%rowtype; cid uuid := app.company_id();
begin
  select * into ph from public.customer_photos where id = p_photo and company_id = cid;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  perform app.customer_guard(ph.customer_id, 'customers.customer.update');
  if p_patch ? 'status_id' and nullif(p_patch ->> 'status_id', '') is not null
     and not exists (select 1 from public.customer_photo_statuses s where s.id = (p_patch ->> 'status_id')::uuid and s.company_id = cid) then
    raise exception 'status not found' using errcode = '22023'; end if;
  if coalesce((p_patch ->> 'is_default')::boolean, false) then
    update public.customer_photos set is_default = false where customer_id = ph.customer_id and company_id = cid and is_default and id <> p_photo;
  end if;
  update public.customer_photos set
    caption = case when p_patch ? 'caption' then nullif(btrim(coalesce(p_patch ->> 'caption', '')), '') else caption end,
    caption_local = case when p_patch ? 'caption_local' then nullif(btrim(coalesce(p_patch ->> 'caption_local', '')), '') else caption_local end,
    status_id = case when p_patch ? 'status_id' then nullif(p_patch ->> 'status_id', '')::uuid else status_id end,
    is_default = case when p_patch ? 'is_default' then coalesce((p_patch ->> 'is_default')::boolean, false) else is_default end,
    sort_order = case when p_patch ? 'sort_order' then coalesce((p_patch ->> 'sort_order')::int, 0) else sort_order end,
    archived_at = case when p_patch ? 'archived' then case when (p_patch ->> 'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end
  where id = p_photo;
end $$;

-- credit terms (own permission)
create or replace function public.customers_save_credit(p_customer uuid, p_enabled boolean, p_limit_cents bigint,
  p_currency text, p_payment_term_id uuid, p_on_hold boolean, p_hold_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; cid uuid := app.company_id();
begin
  c := app.customer_guard(p_customer, 'customers.credit.update');
  if p_payment_term_id is not null and not exists (select 1 from public.payment_terms t where t.id = p_payment_term_id and t.company_id = cid) then
    raise exception 'payment term not found' using errcode = '22023'; end if;
  insert into public.customer_credit_terms (company_id, customer_id, credit_enabled, credit_limit_cents, currency, payment_term_id, on_hold, hold_reason)
  values (cid, p_customer, coalesce(p_enabled, false), p_limit_cents, nullif(upper(btrim(coalesce(p_currency, ''))), ''),
          p_payment_term_id, coalesce(p_on_hold, false), nullif(btrim(coalesce(p_hold_reason, '')), ''))
  on conflict (customer_id) do update set credit_enabled = excluded.credit_enabled, credit_limit_cents = excluded.credit_limit_cents,
    currency = excluded.currency, payment_term_id = excluded.payment_term_id, on_hold = excluded.on_hold, hold_reason = excluded.hold_reason;
  if coalesce(p_on_hold, false) and c.status = 'active' then
    update public.customers set status = 'blocked' where id = p_customer and company_id = cid;
  elsif not coalesce(p_on_hold, false) and c.status = 'blocked' then
    update public.customers set status = 'active' where id = p_customer and company_id = cid;
  end if;
end $$;

-- assignments: many reps, one primary (= owner_employee_id)
create or replace function public.customers_set_assignments(p_customer uuid, p_employees uuid[], p_primary uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; cid uuid := app.company_id(); e uuid; b uuid; want uuid[];
begin
  c := app.customer_guard(p_customer, 'customers.customer.assign');
  want := coalesce(p_employees, '{}');
  if cardinality(want) > 30 then raise exception 'too many salespeople' using errcode = '22023'; end if;
  if p_primary is not null and not (p_primary = any (want)) then want := want || p_primary; end if;
  foreach e in array want loop
    if not exists (select 1 from public.employees x where x.id = e and x.company_id = cid and x.status = 'active') then
      raise exception 'employee not found' using errcode = 'P0002'; end if;
  end loop;
  if p_primary is not null and p_primary is distinct from c.owner_employee_id then
    select x.branch_id into b from public.employees x where x.id = p_primary and x.company_id = cid;
    update public.customers set owner_employee_id = p_primary, branch_id = b where id = p_customer and company_id = cid;
  end if;
  foreach e in array want loop
    if not exists (select 1 from public.customer_assignments where customer_id = p_customer and employee_id = e and ended_at is null) then
      insert into public.customer_assignments (company_id, customer_id, employee_id, is_primary) values (cid, p_customer, e, false);
    end if;
  end loop;
  update public.customer_assignments set ended_at = current_date
  where customer_id = p_customer and company_id = cid and ended_at is null and not is_primary and not (employee_id = any (want));
end $$;

-- groups, photo statuses, custom field definitions
create or replace function public.customers_save_group(p_id uuid, p_name text, p_name_local text,
  p_discount numeric, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); gid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform app.require_permission('customers.group.manage');
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if exists (select 1 from public.customer_groups where id = gid and company_id <> cid) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.customer_groups (id, company_id, name, name_local, default_discount_pct, is_active)
  values (gid, cid, btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), p_discount, coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, name_local = excluded.name_local,
    default_discount_pct = excluded.default_discount_pct, is_active = excluded.is_active;
  return gid;
end $$;

create or replace function public.customers_save_photo_status(p_id uuid, p_name text, p_name_local text,
  p_color text, p_sort integer, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); sid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform app.require_permission('customers.field.manage');
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if exists (select 1 from public.customer_photo_statuses where id = sid and company_id <> cid) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.customer_photo_statuses (id, company_id, name, name_local, color, sort_order, is_active)
  values (sid, cid, btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), nullif(btrim(coalesce(p_color, '')), ''), coalesce(p_sort, 0), coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, name_local = excluded.name_local, color = excluded.color,
    sort_order = excluded.sort_order, is_active = excluded.is_active;
  return sid;
end $$;

-- p_options: [{id?, key, label, label_local, color, sort_order, is_active}]
create or replace function public.customers_save_field(p_id uuid, p_key text, p_label text, p_label_local text, p_type text,
  p_required boolean, p_sort integer, p_active boolean, p_show_in_list boolean, p_filterable boolean, p_options jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); fid uuid := coalesce(p_id, gen_random_uuid()); ex public.customer_field_defs%rowtype; o jsonb; oid uuid; was_found boolean;
begin
  perform app.require_permission('customers.field.manage');
  select * into ex from public.customer_field_defs where id = fid;
  was_found := found;
  if was_found and ex.company_id <> cid then raise exception 'not allowed' using errcode = '42501'; end if;
  if was_found then
    if ex.type <> p_type and exists (select 1 from public.customer_field_values where field_id = fid) then
      raise exception 'this field already has values, so its type cannot change' using errcode = '22023'; end if;
    update public.customer_field_defs set label = btrim(p_label), label_local = nullif(btrim(coalesce(p_label_local, '')), ''), type = p_type,
      required = coalesce(p_required, false), sort_order = coalesce(p_sort, 0), is_active = coalesce(p_active, true),
      show_in_list = coalesce(p_show_in_list, false), filterable = coalesce(p_filterable, false) where id = fid;
  else
    insert into public.customer_field_defs (id, company_id, key, label, label_local, type, required, sort_order, is_active, show_in_list, filterable)
    values (fid, cid, p_key, btrim(p_label), nullif(btrim(coalesce(p_label_local, '')), ''), p_type, coalesce(p_required, false),
            coalesce(p_sort, 0), coalesce(p_active, true), coalesce(p_show_in_list, false), coalesce(p_filterable, false));
  end if;
  if p_options is not null then
    if jsonb_typeof(p_options) <> 'array' then raise exception 'bad options' using errcode = '22023'; end if;
    if p_type not in ('single_choice', 'multi_choice') and jsonb_array_length(p_options) > 0 then
      raise exception 'only choice fields have options' using errcode = '22023'; end if;
    for o in select * from jsonb_array_elements(p_options) loop
      oid := nullif(o ->> 'id', '')::uuid;
      if oid is not null and exists (select 1 from public.customer_field_options where id = oid and field_id = fid) then
        update public.customer_field_options set key = o ->> 'key', label = btrim(o ->> 'label'),
          label_local = nullif(btrim(coalesce(o ->> 'label_local', '')), ''), color = nullif(btrim(coalesce(o ->> 'color', '')), ''),
          sort_order = coalesce((o ->> 'sort_order')::int, 0), is_active = coalesce((o ->> 'is_active')::boolean, true) where id = oid;
      else
        insert into public.customer_field_options (id, company_id, field_id, key, label, label_local, color, sort_order, is_active)
        values (coalesce(oid, gen_random_uuid()), cid, fid, o ->> 'key', btrim(o ->> 'label'),
                nullif(btrim(coalesce(o ->> 'label_local', '')), ''), nullif(btrim(coalesce(o ->> 'color', '')), ''),
                coalesce((o ->> 'sort_order')::int, 0), coalesce((o ->> 'is_active')::boolean, true));
      end if;
    end loop;
  end if;
  return fid;
end $$;

-- custom field values for one customer
-- p_values: [{field_id, text|number|date|bool, options: [option_id, ...]}]  (fields not listed stay as they are)
create or replace function public.customers_set_field_values(p_customer uuid, p_values jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; cid uuid := app.company_id(); x jsonb; d public.customer_field_defs%rowtype; oid text; r record;
begin
  c := app.customer_guard(p_customer, 'customers.customer.update');
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) > 40 then
    raise exception 'bad values' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p_values) loop
    select * into d from public.customer_field_defs where id = (x ->> 'field_id')::uuid and company_id = cid and is_active;
    if not found then raise exception 'unknown field' using errcode = '22023'; end if;
    delete from public.customer_field_values where customer_id = p_customer and field_id = d.id;
    if d.type in ('single_choice', 'multi_choice') then
      for oid in select jsonb_array_elements_text(coalesce(x -> 'options', '[]'::jsonb)) loop
        insert into public.customer_field_values (company_id, customer_id, field_id, option_id) values (cid, p_customer, d.id, oid::uuid);
      end loop;
    elsif d.type = 'text' and nullif(btrim(coalesce(x ->> 'text', '')), '') is not null then
      insert into public.customer_field_values (company_id, customer_id, field_id, value_text) values (cid, p_customer, d.id, btrim(x ->> 'text'));
    elsif d.type = 'number' and nullif(x ->> 'number', '') is not null then
      insert into public.customer_field_values (company_id, customer_id, field_id, value_number) values (cid, p_customer, d.id, (x ->> 'number')::numeric);
    elsif d.type = 'date' and nullif(x ->> 'date', '') is not null then
      insert into public.customer_field_values (company_id, customer_id, field_id, value_date) values (cid, p_customer, d.id, (x ->> 'date')::date);
    elsif d.type = 'yes_no' and nullif(x ->> 'bool', '') is not null then
      insert into public.customer_field_values (company_id, customer_id, field_id, value_bool) values (cid, p_customer, d.id, (x ->> 'bool')::boolean);
    end if;
  end loop;
  for r in select f.key from public.customer_field_defs f
           where f.company_id = cid and f.is_active and f.required
             and not exists (select 1 from public.customer_field_values v where v.customer_id = p_customer and v.field_id = f.id) loop
    raise exception 'required field missing: %', r.key using errcode = '23514';
  end loop;
end $$;

-- merge duplicates (manager). Keeps the target; the old row is archived and redirects.
create or replace function public.customers_merge(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id(); f public.customers%rowtype; t public.customers%rowtype;
  moved jsonb := '{}'::jsonb; n int; r record;
  handled text[] := array['customer_contacts','customer_contact_channels','customer_addresses','customer_photos',
                          'customer_assignments','customer_field_values','customer_credit_terms'];
begin
  if p_from = p_into then raise exception 'pick two different customers' using errcode = '22023'; end if;
  f := app.customer_guard(p_from, 'customers.customer.merge');
  t := app.customer_guard(p_into, 'customers.customer.merge');
  if f.merged_into_id is not null or t.merged_into_id is not null then
    raise exception 'one of these customers is already merged' using errcode = '22023'; end if;

  update public.customer_contacts set is_default = false where customer_id = p_from and is_default;
  update public.customer_contacts set customer_id = p_into where customer_id = p_from and company_id = cid;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_contacts', n);
  update public.customer_contact_channels set customer_id = p_into where customer_id = p_from and company_id = cid;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_contact_channels', n);
  update public.customer_addresses set is_default = false where customer_id = p_from and is_default;
  update public.customer_addresses set customer_id = p_into where customer_id = p_from and company_id = cid;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_addresses', n);
  update public.customer_photos set is_default = false where customer_id = p_from and is_default;
  update public.customer_photos set customer_id = p_into where customer_id = p_from and company_id = cid;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_photos', n);
  insert into public.customer_assignments (company_id, customer_id, employee_id, role, is_primary)
  select cid, p_into, a.employee_id, a.role, false from public.customer_assignments a
  where a.customer_id = p_from and a.ended_at is null
    and not exists (select 1 from public.customer_assignments b where b.customer_id = p_into and b.employee_id = a.employee_id and b.ended_at is null);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_assignments', n);
  update public.customer_assignments set ended_at = current_date, is_primary = false where customer_id = p_from and ended_at is null;
  update public.customer_field_values v set customer_id = p_into
  where v.customer_id = p_from and not exists (select 1 from public.customer_field_values w where w.customer_id = p_into and w.field_id = v.field_id);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_field_values', n);
  delete from public.customer_field_values where customer_id = p_from;
  update public.customer_credit_terms set customer_id = p_into
  where customer_id = p_from and not exists (select 1 from public.customer_credit_terms w where w.customer_id = p_into);
  get diagnostics n = row_count; moved := moved || jsonb_build_object('customer_credit_terms', n);
  delete from public.customer_credit_terms where customer_id = p_from;

  -- tables other apps registered in customer_refs
  for r in select * from public.customer_refs where table_name <> all (handled) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.table_name and column_name = 'company_id') then
      raise exception 'customer_refs table % needs a company_id column', r.table_name; end if;
    execute format('update public.%I set %I = $1 where %I = $2 and company_id = $3', r.table_name, r.column_name, r.column_name)
      using p_into, p_from, cid;
    get diagnostics n = row_count; moved := moved || jsonb_build_object(r.table_name, n);
  end loop;

  update public.customers set
    name_local = coalesce(name_local, f.name_local), tax_id = coalesce(tax_id, f.tax_id), tax_id_type = coalesce(tax_id_type, f.tax_id_type),
    legal_name = coalesce(legal_name, f.legal_name), legal_name_local = coalesce(legal_name_local, f.legal_name_local),
    email = coalesce(email, f.email), website = coalesce(website, f.website), group_id = coalesce(group_id, f.group_id),
    supplier_id = coalesce(supplier_id, f.supplier_id), default_currency = coalesce(default_currency, f.default_currency),
    notes = case when notes is null then f.notes when f.notes is null or f.notes = notes then notes else notes || E'\n' || f.notes end
  where id = p_into and company_id = cid;
  update public.customers set merged_into_id = p_into, archived_at = coalesce(archived_at, now()), phone_primary = null, phone_secondary = null
  where id = p_from and company_id = cid;
  perform app.refresh_customer_phones(p_into);
  insert into public.customer_merges (company_id, from_customer_id, into_customer_id, merged_by_membership_id, moved, undo_until)
  values (cid, p_from, p_into, app.membership_id(), moved, now() + interval '30 days');
  return moved;
end $$;

-- import
create or replace function app.set_field_from_text(p_company uuid, p_customer uuid, p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.customer_field_defs%rowtype; opt text; oid uuid; v text := nullif(btrim(coalesce(p_value, '')), '');
begin
  select * into d from public.customer_field_defs where company_id = p_company and key = p_key and is_active;
  if not found then raise exception 'unknown field: %', p_key using errcode = '22023'; end if;
  delete from public.customer_field_values where customer_id = p_customer and field_id = d.id;
  if v is null then return; end if;
  if d.type = 'text' then
    insert into public.customer_field_values (company_id, customer_id, field_id, value_text) values (p_company, p_customer, d.id, v);
  elsif d.type = 'number' then
    insert into public.customer_field_values (company_id, customer_id, field_id, value_number) values (p_company, p_customer, d.id, v::numeric);
  elsif d.type = 'date' then
    insert into public.customer_field_values (company_id, customer_id, field_id, value_date) values (p_company, p_customer, d.id, v::date);
  elsif d.type = 'yes_no' then
    insert into public.customer_field_values (company_id, customer_id, field_id, value_bool)
    values (p_company, p_customer, d.id, case when lower(v) in ('yes','y','true','1') then true
                                              when lower(v) in ('no','n','false','0') then false
                                              else null end);
  else
    foreach opt in array string_to_array(v, ';') loop
      oid := null;
      select o.id into oid from public.customer_field_options o
      where o.field_id = d.id and o.is_active and (lower(o.key) = lower(btrim(opt)) or lower(o.label) = lower(btrim(opt))) limit 1;
      if oid is null then raise exception 'unknown option "%" for field %', btrim(opt), p_key using errcode = '22023'; end if;
      insert into public.customer_field_values (company_id, customer_id, field_id, option_id) values (p_company, p_customer, d.id, oid);
    end loop;
  end if;
end $$;

create or replace function app.import_customer_row(p_row jsonb, p_mode text, p_batch uuid, p_cid uuid, p_eid uuid, p_can_group boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  nm text := nullif(btrim(coalesce(p_row ->> 'name', '')), ''); cd text := nullif(btrim(coalesce(p_row ->> 'code', '')), '');
  tx text := nullif(btrim(coalesce(p_row ->> 'tax_id', '')), ''); ph text := app.norm_phone(p_row ->> 'phone');
  gname text := nullif(btrim(coalesce(p_row ->> 'group', '')), ''); gid uuid; ex uuid; nid uuid := gen_random_uuid(); kid uuid; k text;
  lat double precision := nullif(p_row ->> 'latitude', '')::double precision; lon double precision := nullif(p_row ->> 'longitude', '')::double precision;
  addr text := nullif(btrim(coalesce(p_row ->> 'address', '')), ''); typ text := coalesce(nullif(btrim(coalesce(p_row ->> 'type', '')), ''), 'business');
begin
  if nm is null then raise exception 'name is required' using errcode = '22023'; end if;
  if (lat is null) <> (lon is null) then raise exception 'latitude and longitude go together' using errcode = '22023'; end if;
  if gname is not null then
    select g.id into gid from public.customer_groups g where g.company_id = p_cid and lower(g.name) = lower(gname);
    if gid is null then
      if not p_can_group then raise exception 'group "%" does not exist', gname using errcode = '22023'; end if;
      insert into public.customer_groups (company_id, name) values (p_cid, gname) returning id into gid;
    end if;
  end if;
  if cd is not null then select c.id into ex from public.customers c where c.company_id = p_cid and c.code = cd and c.merged_into_id is null; end if;
  if ex is null and tx is not null then select c.id into ex from public.customers c where c.company_id = p_cid and c.tax_id = tx and c.merged_into_id is null limit 1; end if;
  if ex is null and ph is not null then
    select c.id into ex from public.customers c join public.customer_contact_channels ch on ch.customer_id = c.id
    where c.company_id = p_cid and ch.phone_normalized = ph and c.merged_into_id is null limit 1;
  end if;
  if ex is not null and p_mode <> 'create_anyway' then
    if p_mode = 'skip_existing' then return 'skipped'; end if;
    update public.customers set
      name_local = coalesce(nullif(btrim(coalesce(p_row ->> 'name_local', '')), ''), name_local),
      email = coalesce(nullif(btrim(coalesce(p_row ->> 'email', '')), ''), email),
      website = coalesce(nullif(btrim(coalesce(p_row ->> 'website', '')), ''), website),
      tax_id = coalesce(tx, tax_id), tax_id_type = coalesce(nullif(btrim(coalesce(p_row ->> 'tax_id_type', '')), ''), tax_id_type),
      legal_name = coalesce(nullif(btrim(coalesce(p_row ->> 'legal_name', '')), ''), legal_name),
      notes = coalesce(nullif(btrim(coalesce(p_row ->> 'notes', '')), ''), notes), group_id = coalesce(gid, group_id)
    where id = ex and company_id = p_cid;
    for k in select jsonb_object_keys(coalesce(p_row -> 'fields', '{}'::jsonb)) loop
      perform app.set_field_from_text(p_cid, ex, k, p_row -> 'fields' ->> k);
    end loop;
    return 'updated';
  end if;
  insert into public.customers (id, company_id, branch_id, owner_employee_id, created_by_employee_id, client_op_id, code, name, name_local, type,
    group_id, email, website, tax_id, tax_id_type, legal_name, notes, address, latitude, longitude, source, import_batch_id)
  values (nid, p_cid, (select e.branch_id from public.employees e where e.id = p_eid and e.company_id = p_cid), p_eid, p_eid, nid, cd, nm,
    nullif(btrim(coalesce(p_row ->> 'name_local', '')), ''), typ, gid, nullif(btrim(coalesce(p_row ->> 'email', '')), ''),
    nullif(btrim(coalesce(p_row ->> 'website', '')), ''), tx, nullif(btrim(coalesce(p_row ->> 'tax_id_type', '')), ''),
    nullif(btrim(coalesce(p_row ->> 'legal_name', '')), ''), nullif(btrim(coalesce(p_row ->> 'notes', '')), ''),
    addr, lat, lon, 'import', p_batch);
  if nullif(btrim(coalesce(p_row ->> 'phone', '')), '') is not null or nullif(btrim(coalesce(p_row ->> 'phone2', '')), '') is not null
     or nullif(btrim(coalesce(p_row ->> 'telegram', '')), '') is not null or nullif(btrim(coalesce(p_row ->> 'facebook', '')), '') is not null
     or nullif(btrim(coalesce(p_row ->> 'contact_name', '')), '') is not null then
    insert into public.customer_contacts (company_id, customer_id, name, phone, is_default)
    values (p_cid, nid, coalesce(nullif(btrim(coalesce(p_row ->> 'contact_name', '')), ''), nm), nullif(btrim(coalesce(p_row ->> 'phone', '')), ''), true)
    returning id into kid;
    if nullif(btrim(coalesce(p_row ->> 'phone2', '')), '') is not null then
      insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default)
      values (p_cid, nid, kid, 'phone', btrim(p_row ->> 'phone2'),
              not exists (select 1 from public.customer_contact_channels where contact_id = kid and is_default));
    end if;
    if nullif(btrim(coalesce(p_row ->> 'telegram', '')), '') is not null then
      insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default)
      values (p_cid, nid, kid, 'telegram', btrim(p_row ->> 'telegram'),
              not exists (select 1 from public.customer_contact_channels where contact_id = kid and is_default));
    end if;
    if nullif(btrim(coalesce(p_row ->> 'facebook', '')), '') is not null then
      insert into public.customer_contact_channels (company_id, customer_id, contact_id, type, value, is_default)
      values (p_cid, nid, kid, 'facebook', btrim(p_row ->> 'facebook'),
              not exists (select 1 from public.customer_contact_channels where contact_id = kid and is_default));
    end if;
  end if;
  if addr is not null then
    insert into public.customer_addresses (company_id, customer_id, kind, address, latitude, longitude, is_default)
    values (p_cid, nid, 'main', addr, lat, lon, true);
  end if;
  for k in select jsonb_object_keys(coalesce(p_row -> 'fields', '{}'::jsonb)) loop
    perform app.set_field_from_text(p_cid, nid, k, p_row -> 'fields' ->> k);
  end loop;
  return 'created';
end $$;

-- p_mode: skip_existing | update_existing | create_anyway. p_dry_run checks everything and saves nothing.
create or replace function public.customers_import(p_rows jsonb, p_mode text default 'skip_existing',
  p_dry_run boolean default true, p_file_name text default null, p_batch uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id(); eid uuid := app.my_employee_id(); bid uuid := coalesce(p_batch, gen_random_uuid());
  can_group boolean; i int := 0; r_row jsonb; res text; created int := 0; updated int := 0; skipped int := 0;
  errors jsonb := '[]'::jsonb; n_total int;
begin
  perform app.require_permission('customers.customer.import');
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a list' using errcode = '22023'; end if;
  n_total := jsonb_array_length(p_rows);
  if n_total > 1000 then raise exception 'send at most 1000 rows at a time' using errcode = '22023'; end if;
  if p_mode not in ('skip_existing', 'update_existing', 'create_anyway') then raise exception 'bad mode' using errcode = '22023'; end if;
  can_group := (select app.permission_scope('customers.group.manage')) is not null;
  begin
    insert into public.customer_import_batches (id, company_id, created_by_membership_id, file_name, mode, total)
    values (bid, cid, app.membership_id(), p_file_name, p_mode, 0)
    on conflict (id) do nothing;
    if not exists (select 1 from public.customer_import_batches where id = bid and company_id = cid) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    for r_row in select * from jsonb_array_elements(p_rows) loop
      i := i + 1;
      begin
        res := app.import_customer_row(r_row, p_mode, bid, cid, eid, can_group);
        if res = 'created' then created := created + 1; elsif res = 'updated' then updated := updated + 1; else skipped := skipped + 1; end if;
      exception when others then
        if sqlstate = '42501' then raise; end if;
        errors := errors || jsonb_build_object('row', i, 'message', sqlerrm);
      end;
    end loop;
    update public.customer_import_batches set total = total + i, created_count = created_count + created, updated_count = updated_count + updated,
      skipped_count = skipped_count + skipped, error_count = error_count + jsonb_array_length(errors) where id = bid;
    if p_dry_run then raise exception 'dry run' using errcode = 'CDRY0'; end if;
  exception when sqlstate 'CDRY0' then
    null;
  end;
  return jsonb_build_object('batch_id', case when p_dry_run then null else bid end, 'dry_run', p_dry_run, 'total', i,
    'created', created, 'updated', updated, 'skipped', skipped, 'errors', errors);
end $$;

-- undo an import: customers it created are archived (never deleted)
create or replace function public.customers_import_rollback(p_batch uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); n int;
begin
  perform app.require_permission('customers.customer.import');
  if not exists (select 1 from public.customer_import_batches where id = p_batch and company_id = cid and rolled_back_at is null) then
    raise exception 'import not found' using errcode = 'P0002'; end if;
  update public.customers set archived_at = coalesce(archived_at, now()) where import_batch_id = p_batch and company_id = cid;
  get diagnostics n = row_count;
  update public.customer_import_batches set rolled_back_at = now() where id = p_batch;
  return n;
end $$;

-- default grants for roles created from now on
create or replace function app.seed_customer_role_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_system then return new; end if;
  if new.name in ('Owner', 'Admin') then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    select new.company_id, new.id, p.key, 'company'::public.data_scope from public.permissions p where p.key like 'customers.%'
    on conflict do nothing;
  elsif new.name = 'Manager' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    select new.company_id, new.id, p.key, case when p.key = 'customers.customer.create' then 'company'::public.data_scope else 'team'::public.data_scope end
    from public.permissions p where p.key like 'customers.%'
    on conflict do nothing;
  elsif new.name = 'Sales rep' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    select new.company_id, new.id, k, 'own'::public.data_scope from unnest(array['customers.customer.read', 'customers.customer.create',
      'customers.customer.update', 'customers.address.manage']) k
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger roles_seed_customer_defaults after insert on public.roles
  for each row execute function app.seed_customer_role_defaults();

-- who may call what
do $$
declare f text;
begin
  foreach f in array array[
    'customers_create(uuid,text,text,text,text)', 'customers_save_profile(uuid,jsonb)', 'customers_archive(uuid,boolean)',
    'customers_save_contacts(uuid,jsonb)', 'customers_save_addresses(uuid,jsonb)', 'customers_update_photo(uuid,jsonb)',
    'customers_save_credit(uuid,boolean,bigint,text,uuid,boolean,text)', 'customers_set_assignments(uuid,uuid[],uuid)',
    'customers_save_group(uuid,text,text,numeric,boolean)', 'customers_save_photo_status(uuid,text,text,text,integer,boolean)',
    'customers_save_field(uuid,text,text,text,text,boolean,integer,boolean,boolean,boolean,jsonb)',
    'customers_set_field_values(uuid,jsonb)', 'customers_merge(uuid,uuid)',
    'customers_import(jsonb,text,boolean,text,uuid)', 'customers_import_rollback(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
