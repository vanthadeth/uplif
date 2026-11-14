-- Stock app, piece 6: item pictures. Many per item, exactly one main. The first picture added becomes the main one,
-- deleting the main promotes the next, and the main is changed only through set_item_main_image() so there is never
-- a moment with two. Files live in the private stock-images bucket under <company id>/items/<file>.

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  item_id uuid not null,
  image_path text not null unique check (image_path like company_id::text || '/items/%' and length(image_path) <= 300),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (company_id, item_id) references public.items (company_id, id) on delete cascade
);
create index item_images_item on public.item_images (item_id, created_at);
create unique index item_images_one_main on public.item_images (item_id) where is_main;

-- At most 10 pictures per item; the first one becomes the main picture.
create function app.item_images_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.item_images where item_id = new.item_id) >= 10 then
    raise exception 'An item can have at most 10 pictures' using errcode = 'P0001';
  end if;
  new.is_main := not exists (select 1 from public.item_images where item_id = new.item_id and is_main);
  return new;
end $$;
create trigger item_images_guard before insert on public.item_images for each row execute function app.item_images_before_insert();

-- When the main picture is deleted, the oldest remaining one becomes the main.
create function app.item_images_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_main then
    update public.item_images set is_main = true
    where id = (select id from public.item_images where item_id = old.item_id order by created_at, id limit 1);
  end if;
  return null;
end $$;
revoke all on function app.item_images_after_delete() from public, anon, authenticated;
create trigger item_images_promote after delete on public.item_images for each row execute function app.item_images_after_delete();

create trigger audit_item_images after insert or update or delete on public.item_images for each row execute function app.audit_row();

alter table public.item_images enable row level security;
alter table public.item_images force row level security;
create policy item_images_select on public.item_images for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy item_images_insert on public.item_images for insert to authenticated
  with check (company_id = (select app.company_id()) and (select app.stock_can_manage()));
create policy item_images_delete on public.item_images for delete to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_manage()));
-- No update grant: is_main changes only through the function below.
grant select, insert (company_id, item_id, image_path), delete on public.item_images to authenticated;

create function public.set_item_main_image(p_image_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_item uuid;
begin
  if not app.stock_can_manage() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select item_id into v_item from public.item_images where id = p_image_id and company_id = app.company_id();
  if v_item is null then
    raise exception 'Picture not found' using errcode = 'P0002';
  end if;
  update public.item_images set is_main = false where item_id = v_item and is_main and id <> p_image_id;
  update public.item_images set is_main = true where id = p_image_id;
end $$;
revoke all on function public.set_item_main_image(uuid) from public, anon;
grant execute on function public.set_item_main_image(uuid) to authenticated;
