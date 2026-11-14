-- Stock app, piece 7: variants (the versions of an item that are counted separately: shirt size, cup size).
-- Free text per item, no shared lists. Every item always has exactly one hidden "default" variant so stock, orders
-- and POS can always point at a variant. While an item has real variants the default one is switched off.
-- A real variant may carry its own price (empty = use the item price), SKU, barcode and one of the item's pictures.

-- Pictures are ordered by when they were added, even within one transaction.
alter table public.item_images alter column created_at set default clock_timestamp();
alter table public.item_images add constraint item_images_item_id_unique unique (item_id, id);

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  item_id uuid not null,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 160),
  name_local text check (name_local is null or length(name_local) <= 160),
  sku text check (sku is null or (length(btrim(sku)) > 0 and length(sku) <= 60)),
  barcode text check (barcode is null or (length(btrim(barcode)) > 0 and length(barcode) <= 60)),
  price numeric(14, 4) check (price is null or price >= 0),
  image_id uuid,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, item_id) references public.items (company_id, id) on delete cascade,
  foreign key (item_id, image_id) references public.item_images (item_id, id) on delete set null (image_id)
);
create unique index item_variants_one_default on public.item_variants (item_id) where is_default;
create unique index item_variants_item_name on public.item_variants (item_id, lower(btrim(name))) where not is_default;
create unique index item_variants_company_sku on public.item_variants (company_id, lower(btrim(sku))) where sku is not null;
create unique index item_variants_company_barcode on public.item_variants (company_id, lower(btrim(barcode))) where barcode is not null;
create index item_variants_item on public.item_variants (item_id, created_at);

create trigger touch_item_variants before update on public.item_variants for each row execute function app.touch_updated_at();
create trigger immutable_company_item_variants before update on public.item_variants for each row execute function app.forbid_company_change();
create trigger audit_item_variants after insert or update or delete on public.item_variants for each row execute function app.audit_row();

-- Every item gets its default variant (existing items too).
insert into public.item_variants (company_id, item_id, name, is_default)
select company_id, id, name, true from public.items;

create function app.items_add_default_variant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.item_variants (company_id, item_id, name, is_default) values (new.company_id, new.id, new.name, true);
  return null;
end $$;
revoke all on function app.items_add_default_variant() from public, anon, authenticated;
create trigger items_default_variant after insert on public.items for each row execute function app.items_add_default_variant();

-- At most 100 real variants per item.
create function app.item_variants_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.is_default and (select count(*) from public.item_variants where item_id = new.item_id and not is_default) >= 100 then
    raise exception 'An item can have at most 100 variants' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger item_variants_guard before insert on public.item_variants for each row execute function app.item_variants_before_insert();

-- The default variant is on only while the item has no real variants.
create function app.item_variants_sync_default() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.item_variants d set is_active = not exists (select 1 from public.item_variants r where r.item_id = v_item and not r.is_default)
  where d.item_id = v_item and d.is_default;
  return null;
end $$;
revoke all on function app.item_variants_sync_default() from public, anon, authenticated;
create trigger item_variants_sync_ins after insert on public.item_variants for each row when (not new.is_default) execute function app.item_variants_sync_default();
create trigger item_variants_sync_del after delete on public.item_variants for each row when (not old.is_default) execute function app.item_variants_sync_default();

alter table public.item_variants enable row level security;
alter table public.item_variants force row level security;
create policy item_variants_select on public.item_variants for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy item_variants_insert on public.item_variants for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy item_variants_update on public.item_variants for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
-- The default variant is never deleted by hand; it goes away with its item.
create policy item_variants_delete on public.item_variants for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()) and not is_default);
grant select, insert (company_id, item_id, name, name_local, sku, barcode, price, image_id),
  update (name, name_local, sku, barcode, price, image_id, is_active), delete
  on public.item_variants to authenticated;
