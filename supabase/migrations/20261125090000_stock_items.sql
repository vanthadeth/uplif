-- Stock app, piece 5: items (the catalogue). This slice holds the item itself: names, description, category, brand,
-- the one base unit it is counted in, optional pack shortcuts and the selling price. Pictures, variants (counted) and
-- properties (not counted) come in the next pieces. Cost is deliberately absent: it arrives with its own permission.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sku text check (sku is null or (length(btrim(sku)) > 0 and length(sku) <= 60)),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 160),
  name_local text check (name_local is null or length(name_local) <= 160),
  description text check (description is null or length(description) <= 2000),
  description_local text check (description_local is null or length(description_local) <= 2000),
  category_id uuid,
  brand_id uuid,
  kind text not null default 'stocked' check (kind in ('stocked', 'service')),
  base_uom text not null default 'pcs' check (length(btrim(base_uom)) > 0 and length(base_uom) <= 30),
  -- Entry shortcuts only: [{"name":"Box","qty":24}]. Stock itself is always in the base unit.
  packs jsonb not null default '[]'
    check (jsonb_typeof(packs) = 'array' and jsonb_array_length(packs) <= 10 and pg_column_size(packs) <= 2000),
  price numeric(14, 4) not null default 0 check (price >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  -- Deleting a category or brand leaves the item with none (only the pointer is cleared, never the company).
  foreign key (company_id, category_id) references public.categories (company_id, id) on delete set null (category_id),
  foreign key (company_id, brand_id) references public.brands (company_id, id) on delete set null (brand_id)
);
create unique index items_company_sku on public.items (company_id, lower(btrim(sku))) where sku is not null;
create index items_company_category on public.items (company_id, category_id);
create index items_company_brand on public.items (company_id, brand_id);

create trigger touch_items before update on public.items for each row execute function app.touch_updated_at();
create trigger immutable_company_items before update on public.items for each row execute function app.forbid_company_change();
create trigger audit_items after insert or update or delete on public.items for each row execute function app.audit_row();

alter table public.items enable row level security;
alter table public.items force row level security;
create policy items_select on public.items for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy items_insert on public.items for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy items_update on public.items for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy items_delete on public.items for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
grant select, insert (company_id, sku, name, name_local, description, description_local, category_id, brand_id, kind, base_uom, packs, price, currency_code),
  update (sku, name, name_local, description, description_local, category_id, brand_id, kind, base_uom, packs, price, currency_code, is_active), delete
  on public.items to authenticated;
