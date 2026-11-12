-- Company policies with acknowledgement (UPLIF Me, Learn tab).
-- Rules (design answers, 2026-11-12):
--  * A company publishes policies. Each policy has a title and a body, in English and optionally the local language.
--  * Changing a policy never edits what people confirmed: it publishes a new version. Versions are never changed or
--    deleted through the app. Staff confirm the current version; a new version needs a new confirmation.
--  * A policy can be archived (hidden from staff, kept for the record) and brought back.
--  * Every active employee linked to a sign-in may read the company's policies and confirm them; that needs no role
--    permission, because a policy is company information. Managing policies needs learn.policy.manage (company scope).
--  * Managers with that permission see who has confirmed the current version.
-- Nobody can write these tables directly; all writes go through the functions below.

-- ---------- permission key ----------
insert into public.permissions (key, description, description_local) values
  ('learn.policy.manage', 'Publish company policies and see who confirmed them', 'ផ្សព្វផ្សាយគោលនយោបាយក្រុមហ៊ុន និងមើលអ្នកបានបញ្ជាក់')
on conflict (key) do nothing;

-- New companies get it through app.seed_system_roles (Owner and Admin receive every permission). Existing companies:
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'learn.policy.manage', 'company'
from public.roles ro where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;

-- ---------- tables ----------
create table public.company_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  title_local text check (title_local is null or length(title_local) <= 200),
  archived boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by)
);
create index company_policies_company_idx on public.company_policies (company_id, archived);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  policy_id uuid not null,
  version integer not null check (version >= 1),
  body text not null check (length(btrim(body)) between 1 and 20000),
  body_local text check (body_local is null or length(body_local) <= 20000),
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (company_id, id),
  unique (policy_id, version),
  foreign key (company_id, policy_id) references public.company_policies (company_id, id) on delete cascade,
  foreign key (company_id, published_by) references public.memberships (company_id, id) on delete set null (published_by)
);

create table public.policy_acknowledgements (
  company_id uuid not null references public.companies (id) on delete cascade,
  version_id uuid not null,
  employee_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  primary key (version_id, employee_id),
  foreign key (company_id, version_id) references public.policy_versions (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index policy_acknowledgements_employee_idx on public.policy_acknowledgements (company_id, employee_id);

create trigger touch_company_policies before update on public.company_policies for each row execute function app.touch_updated_at();
create trigger immutable_company_company_policies before update on public.company_policies for each row execute function app.forbid_company_change();
create trigger audit_company_policies after insert or update or delete on public.company_policies for each row execute function app.audit_row();
create trigger audit_policy_versions after insert on public.policy_versions for each row execute function app.audit_row();
create trigger audit_policy_acknowledgements after insert on public.policy_acknowledgements for each row execute function app.audit_row();

-- ---------- RLS: managers read; everyone else goes through my_policies() ----------
alter table public.company_policies enable row level security;
alter table public.company_policies force row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_versions force row level security;
alter table public.policy_acknowledgements enable row level security;
alter table public.policy_acknowledgements force row level security;

create policy company_policies_select on public.company_policies for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.policy.manage')) = 'company');
create policy policy_versions_select on public.policy_versions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.policy.manage')) = 'company');
create policy policy_acknowledgements_select on public.policy_acknowledgements for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.policy.manage')) = 'company');
grant select on public.company_policies, public.policy_versions, public.policy_acknowledgements to authenticated;

-- ---------- internals ----------
create function app.require_policy_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('learn.policy.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_policy_manage() from public, anon, authenticated;

-- ---------- publish: a new policy, or a new version of an existing one ----------
-- A new version is only made when the body changed; a title-only change updates the title and keeps the version.
create function public.save_policy(p_id uuid, p_title text, p_title_local text, p_body text, p_body_local text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  pid uuid := p_id;
  cur public.policy_versions%rowtype;
begin
  perform app.require_policy_manage();
  if length(btrim(coalesce(p_title, ''))) = 0 or length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'title and text are required' using errcode = '22023';
  end if;
  if pid is null then
    insert into public.company_policies (company_id, title, title_local, created_by)
    values (cid, btrim(p_title), nullif(btrim(coalesce(p_title_local, '')), ''), app.membership_id()) returning id into pid;
    insert into public.policy_versions (company_id, policy_id, version, body, body_local, published_by)
    values (cid, pid, 1, p_body, nullif(btrim(coalesce(p_body_local, '')), ''), app.membership_id());
    return pid;
  end if;
  if not exists (select 1 from public.company_policies where id = pid and company_id = cid) then
    raise exception 'policy not found' using errcode = 'P0002';
  end if;
  update public.company_policies set title = btrim(p_title), title_local = nullif(btrim(coalesce(p_title_local, '')), '')
  where id = pid and company_id = cid;
  select * into cur from public.policy_versions where policy_id = pid and company_id = cid order by version desc limit 1;
  if cur.body is distinct from p_body or cur.body_local is distinct from nullif(btrim(coalesce(p_body_local, '')), '') then
    insert into public.policy_versions (company_id, policy_id, version, body, body_local, published_by)
    values (cid, pid, cur.version + 1, p_body, nullif(btrim(coalesce(p_body_local, '')), ''), app.membership_id());
  end if;
  return pid;
end $$;

create function public.archive_policy(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_policy_manage();
  update public.company_policies set archived = coalesce(p_archived, true) where id = p_id and company_id = app.company_id();
  if not found then raise exception 'policy not found' using errcode = 'P0002'; end if;
end $$;

-- ---------- staff side ----------
-- The policies a person can read, with the current version and whether they confirmed it.
create function public.my_policies()
returns table (policy_id uuid, version_id uuid, version integer, title text, title_local text, body text, body_local text,
               published_at timestamptz, acknowledged_at timestamptz, confirmed_earlier boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, v.id, v.version, p.title, p.title_local, v.body, v.body_local, v.published_at, a.acknowledged_at,
         exists (select 1 from public.policy_acknowledgements a2 join public.policy_versions v2 on v2.id = a2.version_id
                 where v2.policy_id = p.id and a2.employee_id = eid and v2.version < v.version)
  from public.company_policies p
  join lateral (select * from public.policy_versions x where x.policy_id = p.id order by x.version desc limit 1) v on true
  left join public.policy_acknowledgements a on a.version_id = v.id and a.employee_id = eid
  where p.company_id = cid and not p.archived
  order by (a.acknowledged_at is null) desc, v.published_at desc;
end $$;

create function public.acknowledge_policy(p_version_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  emp public.employees%rowtype;
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into emp from public.employees where id = eid;
  if emp.status <> 'active' then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Only the current version of a policy that is not archived can be confirmed.
  if not exists (
    select 1 from public.policy_versions v join public.company_policies p on p.id = v.policy_id
    where v.id = p_version_id and v.company_id = cid and not p.archived
      and v.version = (select max(x.version) from public.policy_versions x where x.policy_id = v.policy_id)
  ) then
    raise exception 'this version is no longer current' using errcode = 'P0002';
  end if;
  insert into public.policy_acknowledgements (company_id, version_id, employee_id) values (cid, p_version_id, eid)
  on conflict do nothing;
end $$;

-- Managers: who has and has not confirmed the current version of a policy.
create function public.policy_ack_status(p_policy_id uuid)
returns table (employee_id uuid, name text, name_local text, acknowledged_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  vid uuid;
begin
  perform app.require_policy_manage();
  select v.id into vid from public.policy_versions v
  where v.company_id = cid and v.policy_id = p_policy_id order by v.version desc limit 1;
  if vid is null then raise exception 'policy not found' using errcode = 'P0002'; end if;
  return query
  select e.id, e.name, e.name_local, a.acknowledged_at
  from public.employees e
  left join public.policy_acknowledgements a on a.version_id = vid and a.employee_id = e.id
  where e.company_id = cid and e.status = 'active' and e.membership_id is not null
  order by (a.acknowledged_at is null) desc, e.name;
end $$;

revoke execute on function public.save_policy(uuid, text, text, text, text) from public, anon;
revoke execute on function public.archive_policy(uuid, boolean) from public, anon;
revoke execute on function public.my_policies() from public, anon;
revoke execute on function public.acknowledge_policy(uuid) from public, anon;
revoke execute on function public.policy_ack_status(uuid) from public, anon;
grant execute on function public.save_policy(uuid, text, text, text, text) to authenticated;
grant execute on function public.archive_policy(uuid, boolean) to authenticated;
grant execute on function public.my_policies() to authenticated;
grant execute on function public.acknowledge_policy(uuid) to authenticated;
grant execute on function public.policy_ack_status(uuid) to authenticated;
