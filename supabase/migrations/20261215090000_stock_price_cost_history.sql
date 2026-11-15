-- Stock: a log of every change to a selling price and to a cost, for items and for variants.
-- Selling price history can be read by anyone who can read Stock. Cost history only by roles holding stock.cost.view.
-- Rows are written by triggers only (nobody can insert, change or delete them by hand). The person's name and the
-- variant's name are copied into the row, so the log stays readable after a person leaves or a variant is deleted.

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  item_id uuid not null,
  variant_id uuid,                       -- null = the item's own price
  variant_name text,
  old_price numeric(14, 4),              -- null = no own price (variant) or first price
  new_price numeric(14, 4),              -- null = variant went back to the item price
  currency_code text not null,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  foreign key (company_id, item_id) references public.items (company_id, id) on delete cascade
);
create index price_history_item on public.price_history (item_id, changed_at desc);

create table public.cost_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  item_id uuid not null,
  variant_id uuid,
  variant_name text,
  old_cost numeric(14, 4),
  new_cost numeric(14, 4),               -- null = cost removed
  currency_code text not null,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  foreign key (company_id, item_id) references public.items (company_id, id) on delete cascade
);
create index cost_history_item on public.cost_history (item_id, changed_at desc);

alter table public.price_history enable row level security;
alter table public.price_history force row level security;
alter table public.cost_history enable row level security;
alter table public.cost_history force row level security;
create policy price_history_select on public.price_history for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy cost_history_select on public.cost_history for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_view_cost()));
grant select on public.price_history, public.cost_history to authenticated;

-- Who is making the change right now (name copied into the log row).
create function app.stock_actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select p.full_name from public.memberships m join public.profiles p on p.user_id = m.user_id where m.id = app.membership_id()
$$;
revoke all on function app.stock_actor_name() from public, anon, authenticated;

create function app.log_price(p_company uuid, p_item uuid, p_variant uuid, p_old numeric, p_new numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_old is not distinct from p_new then return; end if;
  insert into public.price_history (company_id, item_id, variant_id, variant_name, old_price, new_price, currency_code, changed_by, changed_by_name)
  select p_company, p_item, p_variant, (select v.name from public.item_variants v where v.id = p_variant),
         p_old, p_new, i.currency_code, app.membership_id(), app.stock_actor_name()
  from public.items i where i.id = p_item;
end $$;
revoke all on function app.log_price(uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;

create function app.log_cost(p_company uuid, p_item uuid, p_variant uuid, p_old numeric, p_new numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_old is not distinct from p_new then return; end if;
  insert into public.cost_history (company_id, item_id, variant_id, variant_name, old_cost, new_cost, currency_code, changed_by, changed_by_name)
  select p_company, p_item, p_variant, (select v.name from public.item_variants v where v.id = p_variant),
         p_old, p_new, i.currency_code, app.membership_id(), app.stock_actor_name()
  from public.items i where i.id = p_item;
end $$;
revoke all on function app.log_cost(uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;

-- Item selling price.
create function app.items_log_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.log_price(new.company_id, new.id, null, old.price, new.price);
  return null;
end $$;
revoke all on function app.items_log_price() from public, anon, authenticated;
create trigger items_price_history after update of price on public.items for each row when (old.price is distinct from new.price) execute function app.items_log_price();

-- Variant selling price (insert with an own price, or any change including going back to the item price).
create function app.variants_log_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.log_price(new.company_id, new.item_id, new.id, case when tg_op = 'UPDATE' then old.price end, new.price);
  return null;
end $$;
revoke all on function app.variants_log_price() from public, anon, authenticated;
create trigger variants_price_history_ins after insert on public.item_variants for each row when (new.price is not null) execute function app.variants_log_price();
create trigger variants_price_history_upd after update of price on public.item_variants for each row when (old.price is distinct from new.price) execute function app.variants_log_price();

-- Item cost.
create function app.item_costs_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform app.log_cost(old.company_id, old.item_id, null, old.cost, null);
  elsif tg_op = 'INSERT' then perform app.log_cost(new.company_id, new.item_id, null, null, new.cost);
  else perform app.log_cost(new.company_id, new.item_id, null, old.cost, new.cost); end if;
  return null;
end $$;
revoke all on function app.item_costs_log() from public, anon, authenticated;
create trigger item_costs_history after insert or update of cost or delete on public.item_costs for each row execute function app.item_costs_log();

-- Variant cost.
create function app.variant_costs_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item uuid;
begin
  select item_id into v_item from public.item_variants where id = coalesce(new.variant_id, old.variant_id);
  if v_item is null then return null; end if;   -- the variant itself is being deleted
  if tg_op = 'DELETE' then perform app.log_cost(old.company_id, v_item, old.variant_id, old.cost, null);
  elsif tg_op = 'INSERT' then perform app.log_cost(new.company_id, v_item, new.variant_id, null, new.cost);
  else perform app.log_cost(new.company_id, v_item, new.variant_id, old.cost, new.cost); end if;
  return null;
end $$;
revoke all on function app.variant_costs_log() from public, anon, authenticated;
create trigger variant_costs_history after insert or update of cost or delete on public.variant_costs for each row execute function app.variant_costs_log();
