-- Stock: a reorder level per item. When the stock of the item (all locations the person can see) is at or below it,
-- the stock levels screen shows it as Low. Empty means no alert.
alter table public.items add column reorder_level numeric(14, 3) check (reorder_level is null or reorder_level >= 0);
grant insert (reorder_level), update (reorder_level) on public.items to authenticated;
