-- Playbook (UPLIF Me > Learn > Playbook): step-by-step guides a company writes for its people.
-- Rules (design answers, 2026-11-13):
--  * A guide has a title, an optional topic and read time, and numbered steps. Each step has a title, text (rich text),
--    an optional picture, and is either "must do" (default) or "skip if <condition>". English with an optional local language.
--  * A guide is for everyone, or only for the chosen positions. Staff mark a guide done (and can undo it).
--  * Managers with learn.playbook.manage write guides and see who finished each one.
--  * Every active employee linked to a sign-in may read the guides meant for them; that needs no role permission.
-- Nobody writes these tables directly; every write goes through the functions below. Pictures live in a private bucket,
-- in a folder named after the company, so another company can never read them.

insert into public.permissions (key, description, description_local) values
  ('learn.playbook.manage', 'Write the Playbook and see who finished each guide', 'សរសេរសៀវភៅណែនាំ និងមើលអ្នកបានបញ្ចប់ការណែនាំនីមួយៗ')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'learn.playbook.manage', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;

-- ---------- tables ----------
create table public.playbook_guides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  title_local text check (title_local is null or length(title_local) <= 200),
  topic text check (topic is null or length(btrim(topic)) between 1 and 40),
  read_minutes integer check (read_minutes is null or read_minutes between 1 and 120),
  archived boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by)
);
create index playbook_guides_company_idx on public.playbook_guides (company_id, archived);

create table public.playbook_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  guide_id uuid not null,
  position integer not null check (position >= 1),
  title text not null check (length(btrim(title)) between 1 and 200),
  title_local text check (title_local is null or length(title_local) <= 200),
  skip_if boolean not null default false,
  skip_condition text check (skip_condition is null or length(skip_condition) <= 300),
  skip_condition_local text check (skip_condition_local is null or length(skip_condition_local) <= 300),
  body text not null default '' check (length(body) <= 20000),
  body_local text check (body_local is null or length(body_local) <= 20000),
  image_path text check (image_path is null or length(image_path) <= 300),
  unique (company_id, id),
  foreign key (company_id, guide_id) references public.playbook_guides (company_id, id) on delete cascade,
  check (not skip_if or length(btrim(coalesce(skip_condition, ''))) > 0)
);
create index playbook_steps_guide_idx on public.playbook_steps (guide_id, position);

create table public.playbook_guide_positions (
  company_id uuid not null references public.companies (id) on delete cascade,
  guide_id uuid not null,
  position_id uuid not null,
  primary key (guide_id, position_id),
  foreign key (company_id, guide_id) references public.playbook_guides (company_id, id) on delete cascade,
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete cascade
);

create table public.playbook_progress (
  company_id uuid not null references public.companies (id) on delete cascade,
  guide_id uuid not null,
  employee_id uuid not null,
  done_at timestamptz not null default now(),
  primary key (guide_id, employee_id),
  foreign key (company_id, guide_id) references public.playbook_guides (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index playbook_progress_employee_idx on public.playbook_progress (company_id, employee_id);

create trigger touch_playbook_guides before update on public.playbook_guides for each row execute function app.touch_updated_at();
create trigger immutable_company_playbook_guides before update on public.playbook_guides for each row execute function app.forbid_company_change();
create trigger audit_playbook_guides after insert or update or delete on public.playbook_guides for each row execute function app.audit_row();
create trigger audit_playbook_progress after insert or delete on public.playbook_progress for each row execute function app.audit_row();

-- ---------- RLS: managers read; everyone else goes through the functions ----------
alter table public.playbook_guides enable row level security;
alter table public.playbook_guides force row level security;
alter table public.playbook_steps enable row level security;
alter table public.playbook_steps force row level security;
alter table public.playbook_guide_positions enable row level security;
alter table public.playbook_guide_positions force row level security;
alter table public.playbook_progress enable row level security;
alter table public.playbook_progress force row level security;

create policy playbook_guides_select on public.playbook_guides for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.playbook.manage')) = 'company');
create policy playbook_steps_select on public.playbook_steps for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.playbook.manage')) = 'company');
create policy playbook_guide_positions_select on public.playbook_guide_positions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.playbook.manage')) = 'company');
create policy playbook_progress_select on public.playbook_progress for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.playbook.manage')) = 'company');
grant select on public.playbook_guides, public.playbook_steps, public.playbook_guide_positions, public.playbook_progress to authenticated;

-- ---------- internals ----------
create function app.require_playbook_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('learn.playbook.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_playbook_manage() from public, anon, authenticated;

-- Is this guide meant for me? (Everyone when it has no positions chosen.)
create function app.playbook_for_me(p_guide_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.playbook_guides g
    where g.id = p_guide_id and g.company_id = app.company_id() and not g.archived
      and (not exists (select 1 from public.playbook_guide_positions gp where gp.guide_id = g.id)
           or exists (select 1 from public.playbook_guide_positions gp
                      join public.employees e on e.position_id = gp.position_id
                      where gp.guide_id = g.id and e.id = app.my_employee_id()))
  )
$$;
revoke execute on function app.playbook_for_me(uuid) from public, anon, authenticated;

-- ---------- storage bucket for step pictures ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('playbook-images', 'playbook-images', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

-- Path: <company id>/<file name>. Active members read their company's folder; managers write it.
create function app.playbook_image_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member() and (string_to_array(p_name, '/'))[1] = app.company_id()::text
    and array_length(string_to_array(p_name, '/'), 1) = 2
$$;
create function app.playbook_image_write(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member() and app.permission_scope('learn.playbook.manage') = 'company'
    and (string_to_array(p_name, '/'))[1] = app.company_id()::text
    and array_length(string_to_array(p_name, '/'), 1) = 2
$$;
revoke all on function app.playbook_image_read(text) from public, anon;
revoke all on function app.playbook_image_write(text) from public, anon;
grant execute on function app.playbook_image_read(text) to authenticated;
grant execute on function app.playbook_image_write(text) to authenticated;

create policy playbook_images_select on storage.objects for select to authenticated
  using (bucket_id = 'playbook-images' and app.playbook_image_read(name));
create policy playbook_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'playbook-images' and app.playbook_image_write(name));
create policy playbook_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'playbook-images' and app.playbook_image_write(name));

-- ---------- write: a guide with all its steps (the steps are replaced as a set) ----------
-- p_steps: [{title, title_local, skip_if, skip_condition, skip_condition_local, body, body_local, image_path}] in order.
create function public.save_playbook(p_id uuid, p_title text, p_title_local text, p_topic text, p_read_minutes integer,
                                     p_position_ids uuid[], p_steps jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  gid uuid := p_id;
  s jsonb;
  n integer := 0;
  img text;
begin
  perform app.require_playbook_manage();
  if length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'title is required' using errcode = '22023'; end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'a guide needs at least one step' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 50 then raise exception 'too many steps' using errcode = '22023'; end if;

  if gid is null then
    insert into public.playbook_guides (company_id, title, title_local, topic, read_minutes, created_by)
    values (cid, btrim(p_title), nullif(btrim(coalesce(p_title_local, '')), ''), nullif(btrim(coalesce(p_topic, '')), ''), p_read_minutes, app.membership_id())
    returning id into gid;
  else
    update public.playbook_guides
       set title = btrim(p_title), title_local = nullif(btrim(coalesce(p_title_local, '')), ''),
           topic = nullif(btrim(coalesce(p_topic, '')), ''), read_minutes = p_read_minutes
     where id = gid and company_id = cid;
    if not found then raise exception 'guide not found' using errcode = 'P0002'; end if;
    delete from public.playbook_steps where guide_id = gid and company_id = cid;
    delete from public.playbook_guide_positions where guide_id = gid and company_id = cid;
  end if;

  for s in select * from jsonb_array_elements(p_steps) loop
    n := n + 1;
    img := nullif(btrim(coalesce(s ->> 'image_path', '')), '');
    if img is not null and (string_to_array(img, '/'))[1] <> cid::text then
      raise exception 'picture does not belong to this company' using errcode = '42501';
    end if;
    if length(btrim(coalesce(s ->> 'title', ''))) = 0 then raise exception 'every step needs a title' using errcode = '22023'; end if;
    insert into public.playbook_steps (company_id, guide_id, position, title, title_local, skip_if, skip_condition, skip_condition_local, body, body_local, image_path)
    values (cid, gid, n, btrim(s ->> 'title'), nullif(btrim(coalesce(s ->> 'title_local', '')), ''),
            coalesce((s ->> 'skip_if')::boolean, false),
            nullif(btrim(coalesce(s ->> 'skip_condition', '')), ''), nullif(btrim(coalesce(s ->> 'skip_condition_local', '')), ''),
            coalesce(s ->> 'body', ''), nullif(coalesce(s ->> 'body_local', ''), ''), img);
  end loop;

  if p_position_ids is not null and array_length(p_position_ids, 1) > 0 then
    insert into public.playbook_guide_positions (company_id, guide_id, position_id)
    select cid, gid, x from unnest(p_position_ids) as x group by x;
  end if;
  return gid;
end $$;

create function public.archive_playbook(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_playbook_manage();
  update public.playbook_guides set archived = coalesce(p_archived, true) where id = p_id and company_id = app.company_id();
  if not found then raise exception 'guide not found' using errcode = 'P0002'; end if;
end $$;

-- Managers: who must read a guide and who has finished it.
create function public.playbook_progress_status(p_guide_id uuid)
returns table (employee_id uuid, name text, name_local text, done_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  perform app.require_playbook_manage();
  if not exists (select 1 from public.playbook_guides where id = p_guide_id and company_id = cid) then
    raise exception 'guide not found' using errcode = 'P0002';
  end if;
  return query
  select e.id, e.name, e.name_local, p.done_at
  from public.employees e
  left join public.playbook_progress p on p.guide_id = p_guide_id and p.employee_id = e.id
  where e.company_id = cid and e.status = 'active' and e.membership_id is not null
    and (not exists (select 1 from public.playbook_guide_positions gp where gp.guide_id = p_guide_id)
         or exists (select 1 from public.playbook_guide_positions gp where gp.guide_id = p_guide_id and gp.position_id = e.position_id))
  order by (p.done_at is null) desc, e.name;
end $$;

-- ---------- staff side ----------
create function public.my_playbooks()
returns table (guide_id uuid, title text, title_local text, topic text, read_minutes integer, step_count integer, done_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select g.id, g.title, g.title_local, g.topic, g.read_minutes,
         (select count(*)::int from public.playbook_steps s where s.guide_id = g.id), p.done_at
  from public.playbook_guides g
  left join public.playbook_progress p on p.guide_id = g.id and p.employee_id = eid
  where g.company_id = cid and app.playbook_for_me(g.id)
  order by (p.done_at is null) desc, g.created_at desc;
end $$;

create function public.my_playbook_steps(p_guide_id uuid)
returns table (step_position integer, title text, title_local text, skip_if boolean, skip_condition text, skip_condition_local text,
               body text, body_local text, image_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or app.my_employee_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.playbook_for_me(p_guide_id) then raise exception 'guide not found' using errcode = 'P0002'; end if;
  return query
  select s.position, s.title, s.title_local, s.skip_if, s.skip_condition, s.skip_condition_local, s.body, s.body_local, s.image_path
  from public.playbook_steps s where s.guide_id = p_guide_id and s.company_id = app.company_id() order by s.position;
end $$;

create function public.set_playbook_done(p_guide_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.playbook_for_me(p_guide_id) then raise exception 'guide not found' using errcode = 'P0002'; end if;
  if coalesce(p_done, true) then
    insert into public.playbook_progress (company_id, guide_id, employee_id) values (cid, p_guide_id, eid) on conflict do nothing;
  else
    delete from public.playbook_progress where guide_id = p_guide_id and employee_id = eid and company_id = cid;
  end if;
end $$;

revoke execute on function public.save_playbook(uuid, text, text, text, integer, uuid[], jsonb) from public, anon;
revoke execute on function public.archive_playbook(uuid, boolean) from public, anon;
revoke execute on function public.playbook_progress_status(uuid) from public, anon;
revoke execute on function public.my_playbooks() from public, anon;
revoke execute on function public.my_playbook_steps(uuid) from public, anon;
revoke execute on function public.set_playbook_done(uuid, boolean) from public, anon;
grant execute on function public.save_playbook(uuid, text, text, text, integer, uuid[], jsonb) to authenticated;
grant execute on function public.archive_playbook(uuid, boolean) to authenticated;
grant execute on function public.playbook_progress_status(uuid) to authenticated;
grant execute on function public.my_playbooks() to authenticated;
grant execute on function public.my_playbook_steps(uuid) to authenticated;
grant execute on function public.set_playbook_done(uuid, boolean) to authenticated;
