-- Stock app, piece 1: brands. Also lays the shared groundwork for the Stock app: permission keys, role defaults,
-- the module gate and the private picture bucket. Module key is 'inventory' (the plan feature behind the Stock app).
-- Rules (decided with Vantha, 2026-11-14): every name is name + name_local; brands carry one picture.

-- ---------- permission keys ----------
insert into public.permissions (key, description) values
  ('stock.catalog.read', 'View brands, categories, suppliers, locations and items'),
  ('stock.catalog.manage', 'Create and edit brands, categories, suppliers, locations and items')
on conflict (key) do nothing;

-- Owner and Admin of every existing company: everything at company scope. Manager manages; the others read.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin', 'Manager') and p.key in ('stock.catalog.read', 'stock.catalog.manage')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'stock.catalog.read', 'company'
from public.roles ro where ro.is_system and ro.name in ('Sales rep', 'Warehouse', 'Accountant')
on conflict do nothing;

-- Companies created from now on: seed_system_roles already gives Owner and Admin every permission, so this only
-- adds the defaults of the other system roles.
create function app.seed_stock_role_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name in ('Manager', 'Sales rep', 'Warehouse', 'Accountant') then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'stock.catalog.read', 'company')
    on conflict do nothing;
    if new.name = 'Manager' then
      insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
      values (new.company_id, new.id, 'stock.catalog.manage', 'company')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function app.seed_stock_role_defaults() from public, anon, authenticated;
create trigger roles_seed_stock_defaults after insert on public.roles for each row execute function app.seed_stock_role_defaults();

-- ---------- gate ----------
-- Can the caller see Stock catalogue data: module in the plan, and a read or manage permission.
create function app.stock_can_read() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and app.module_enabled(app.company_id(), 'inventory')
    and (app.permission_scope('stock.catalog.read') is not null or app.permission_scope('stock.catalog.manage') is not null)
$$;
create function app.stock_can_manage() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member()
    and app.module_enabled(app.company_id(), 'inventory')
    and app.permission_scope('stock.catalog.manage') = 'company'
$$;
revoke all on function app.stock_can_read(), app.stock_can_manage() from public, anon;
grant execute on function app.stock_can_read(), app.stock_can_manage() to authenticated;

-- ---------- brands ----------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  image_path text check (image_path is null or (image_path like company_id::text || '/brands/%' and length(image_path) <= 300)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index brands_company_name on public.brands (company_id, lower(btrim(name)));

create trigger touch_brands before update on public.brands for each row execute function app.touch_updated_at();
create trigger immutable_company_brands before update on public.brands for each row execute function app.forbid_company_change();
create trigger audit_brands after insert or update or delete on public.brands for each row execute function app.audit_row();

alter table public.brands enable row level security;
alter table public.brands force row level security;
create policy brands_select on public.brands for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy brands_insert on public.brands for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy brands_update on public.brands for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy brands_delete on public.brands for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
grant select, insert (company_id, name, name_local, image_path), update (name, name_local, image_path, is_active), delete
  on public.brands to authenticated;

-- ---------- picture bucket ----------
-- Private. Path: <company id>/<kind>/<file>, kind = brands, categories, items, ... Folder 1 is the company id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('stock-images', 'stock-images', false, 2097152, array['image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/webp'];

create function app.stock_image_folder(p_name text, p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select (string_to_array(p_name, '/'))[1] = app.company_id()::text
    and array_length(string_to_array(p_name, '/'), 1) = 3
    and case when p_write then app.stock_can_manage() else app.stock_can_read() end
$$;
revoke all on function app.stock_image_folder(text, boolean) from public, anon;
grant execute on function app.stock_image_folder(text, boolean) to authenticated;

create policy stock_images_select on storage.objects for select to authenticated
  using (bucket_id = 'stock-images' and app.stock_image_folder(name, false));
create policy stock_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-images' and app.stock_image_folder(name, true));
create policy stock_images_update on storage.objects for update to authenticated
  using (bucket_id = 'stock-images' and app.stock_image_folder(name, true))
  with check (bucket_id = 'stock-images' and app.stock_image_folder(name, true));
create policy stock_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'stock-images' and app.stock_image_folder(name, true));
