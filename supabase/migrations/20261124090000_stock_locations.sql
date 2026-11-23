-- Stock app, piece 4: locations (warehouses, shops and other places where stock is kept). Name + name_local like every name.
-- Stock quantities will be counted per location by a later piece.

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  address text check (address is null or length(address) <= 500),
  note text check (note is null or length(note) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index locations_company_name on public.locations (company_id, lower(btrim(name)));

create trigger touch_locations before update on public.locations for each row execute function app.touch_updated_at();
create trigger immutable_company_locations before update on public.locations for each row execute function app.forbid_company_change();
create trigger audit_locations after insert or update or delete on public.locations for each row execute function app.audit_row();

alter table public.locations enable row level security;
alter table public.locations force row level security;
create policy locations_select on public.locations for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy locations_insert on public.locations for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy locations_update on public.locations for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy locations_delete on public.locations for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
grant select, insert (company_id, name, name_local, address, note),
  update (name, name_local, address, note, is_active), delete
  on public.locations to authenticated;
