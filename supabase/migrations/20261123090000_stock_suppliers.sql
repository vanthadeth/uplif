-- Stock app, piece 3: suppliers (who the company buys from). Name + name_local like every name; contact details are
-- plain text so any country's phone and address format fits.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 200),
  address text check (address is null or length(address) <= 500),
  note text check (note is null or length(note) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index suppliers_company_name on public.suppliers (company_id, lower(btrim(name)));

create trigger touch_suppliers before update on public.suppliers for each row execute function app.touch_updated_at();
create trigger immutable_company_suppliers before update on public.suppliers for each row execute function app.forbid_company_change();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function app.audit_row();

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;
create policy suppliers_select on public.suppliers for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy suppliers_update on public.suppliers for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
grant select, insert (company_id, name, name_local, contact_name, phone, email, address, note),
  update (name, name_local, contact_name, phone, email, address, note, is_active), delete
  on public.suppliers to authenticated;
