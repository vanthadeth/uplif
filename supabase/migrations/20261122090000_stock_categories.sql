-- Stock app, piece 2: categories with ONE sub-level (decided with Vantha, 2026-11-14).
-- A category is top level (parent_id null) or a sub-category of a top-level one. Nothing deeper.
-- Every name is name + name_local; a category carries one picture (same private stock-images bucket as brands).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  image_path text check (image_path is null or (image_path like company_id::text || '/categories/%' and length(image_path) <= 300)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  -- A top-level category with sub-categories cannot be deleted until they are removed.
  foreign key (company_id, parent_id) references public.categories (company_id, id) on delete restrict,
  check (parent_id is distinct from id)
);
-- A name is unique among its siblings (same parent), case-insensitive.
create unique index categories_top_name on public.categories (company_id, lower(btrim(name))) where parent_id is null;
create unique index categories_sub_name on public.categories (company_id, parent_id, lower(btrim(name))) where parent_id is not null;
create index categories_parent on public.categories (company_id, parent_id);

-- One level only: the parent must be top level, and a category that has sub-categories cannot become one.
create function app.guard_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories p where p.company_id = new.company_id and p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'categories have one sub-level only' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.categories c where c.company_id = new.company_id and c.parent_id = new.id) then
      raise exception 'a category with sub-categories cannot become a sub-category' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger guard_category before insert or update of parent_id on public.categories for each row execute function app.guard_category();

create trigger touch_categories before update on public.categories for each row execute function app.touch_updated_at();
create trigger immutable_company_categories before update on public.categories for each row execute function app.forbid_company_change();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function app.audit_row();

alter table public.categories enable row level security;
alter table public.categories force row level security;
create policy categories_select on public.categories for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy categories_insert on public.categories for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy categories_update on public.categories for update to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()))
  with check (company_id = (select app.company_id()));
create policy categories_delete on public.categories for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
grant select, insert (company_id, parent_id, name, name_local, image_path), update (parent_id, name, name_local, image_path, is_active), delete
  on public.categories to authenticated;
