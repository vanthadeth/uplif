-- Performance (UPLIF Me > Record > Performance).
-- Rules (design 2026-11-12, "managers review against KPIs set per position"):
--  * Admins set KPIs for each position: a name (English and local) and a weight. Weights are relative, so they need not add to 100.
--  * A manager scores each KPI of an employee's position from 0 to 100 for a calendar month. The overall score is the
--    weighted average of the scores, rounded. Every active KPI of the position must be scored.
--  * One review per employee per month. Sending it again for the same month replaces it. The review keeps the KPI names
--    and weights as they were, so later changes to KPIs never rewrite old reviews.
--  * Nobody reviews themselves. Reviewers are chosen by performance.review.write scope (Owner/Admin company, Manager team).
--  * Staff see their own KPIs, their last score for each, and their own reviews. Nothing is estimated or made up: a person
--    with no review has no score.
--  * Nobody writes these tables directly; every change goes through the functions below and is audited.

insert into public.permissions (key, description, description_local) values
  ('performance.kpi.manage', 'Set the KPIs for each position', 'កំណត់ KPI សម្រាប់មុខតំណែងនីមួយៗ'),
  ('performance.review.write', 'Score staff against their KPIs', 'ដាក់ពិន្ទុបុគ្គលិកតាម KPI')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, 'company'
from public.roles ro cross join (values ('performance.kpi.manage'), ('performance.review.write')) as k(key)
where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'performance.review.write', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

create function app.grant_manager_performance_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Manager' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'performance.review.write', 'team') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger grant_manager_performance_review after insert on public.roles for each row execute function app.grant_manager_performance_review();

-- ---------- tables ----------
create table public.kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  position_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  name_local text check (name_local is null or length(name_local) <= 120),
  weight integer not null default 1 check (weight between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, position_id) references public.positions (company_id, id) on delete cascade
);
create index kpis_position_idx on public.kpis (company_id, position_id);

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  period date not null check (period = date_trunc('month', period)::date),
  overall_percent integer not null check (overall_percent between 0 and 100),
  comment text check (comment is null or length(comment) <= 2000),
  reviewed_by uuid,
  reviewed_at timestamptz not null default now(),
  unique (company_id, id),
  unique (employee_id, period),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, reviewed_by) references public.memberships (company_id, id) on delete set null (reviewed_by)
);

create table public.performance_scores (
  company_id uuid not null references public.companies (id) on delete cascade,
  review_id uuid not null,
  position integer not null check (position >= 1),
  kpi_name text not null,
  kpi_name_local text,
  weight integer not null check (weight between 1 and 100),
  score integer not null check (score between 0 and 100),
  primary key (review_id, position),
  foreign key (company_id, review_id) references public.performance_reviews (company_id, id) on delete cascade
);

create trigger touch_kpis before update on public.kpis for each row execute function app.touch_updated_at();
create trigger immutable_company_kpis before update on public.kpis for each row execute function app.forbid_company_change();
create trigger audit_kpis after insert or update or delete on public.kpis for each row execute function app.audit_row();
create trigger audit_performance_reviews after insert or update on public.performance_reviews for each row execute function app.audit_row();

-- ---------- who may read what ----------
create function app.can_review_performance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and p_employee_id is distinct from (select app.my_employee_id()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('performance.review.write')) is not null
      and (
        (select app.permission_scope('performance.review.write')) = 'company'
        or ((select app.permission_scope('performance.review.write')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('performance.review.write')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;
revoke all on function app.can_review_performance(uuid) from public, anon;
grant execute on function app.can_review_performance(uuid) to authenticated;

alter table public.kpis enable row level security;
alter table public.kpis force row level security;
alter table public.performance_reviews enable row level security;
alter table public.performance_reviews force row level security;
alter table public.performance_scores enable row level security;
alter table public.performance_scores force row level security;

create policy kpis_select on public.kpis for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('performance.kpi.manage')) = 'company');
create policy performance_reviews_select on public.performance_reviews for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.can_review_performance(employee_id))));
create policy performance_scores_select on public.performance_scores for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and exists (select 1 from public.performance_reviews r where r.id = review_id
                     and (r.employee_id = (select app.my_employee_id()) or (select app.can_review_performance(r.employee_id)))));
grant select on public.kpis, public.performance_reviews, public.performance_scores to authenticated;

-- ---------- KPIs ----------
create function public.save_kpi(p_id uuid, p_position_id uuid, p_name text, p_name_local text, p_weight integer, p_active boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  kid uuid := p_id;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('performance.kpi.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name is required' using errcode = '22023'; end if;
  if p_weight is null or p_weight not between 1 and 100 then raise exception 'weight must be 1 to 100' using errcode = '22023'; end if;
  if kid is null then
    if not exists (select 1 from public.positions where id = p_position_id and company_id = cid) then
      raise exception 'position not found' using errcode = 'P0002';
    end if;
    insert into public.kpis (company_id, position_id, name, name_local, weight, active)
    values (cid, p_position_id, btrim(p_name), nullif(btrim(coalesce(p_name_local, '')), ''), p_weight, coalesce(p_active, true))
    returning id into kid;
  else
    update public.kpis set name = btrim(p_name), name_local = nullif(btrim(coalesce(p_name_local, '')), ''),
      weight = p_weight, active = coalesce(p_active, true)
    where id = kid and company_id = cid;
    if not found then raise exception 'KPI not found' using errcode = 'P0002'; end if;
  end if;
  return kid;
end $$;

-- ---------- reviewers ----------
-- The people the caller may review, with their score for the month if there is one.
create function public.performance_review_list(p_period date)
returns table (employee_id uuid, name text, name_local text, position_name text, position_name_local text, kpi_count integer,
               overall_percent integer, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  per date := date_trunc('month', coalesce(p_period, current_date))::date;
begin
  if not (select app.is_active_member()) or (select app.permission_scope('performance.review.write')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select e.id, e.name, e.name_local, p.name, p.name_local,
         (select count(*)::int from public.kpis k where k.position_id = e.position_id and k.active),
         r.overall_percent, r.reviewed_at
  from public.employees e
  left join public.positions p on p.id = e.position_id and p.company_id = e.company_id
  left join public.performance_reviews r on r.employee_id = e.id and r.period = per
  where e.company_id = cid and e.status = 'active' and app.can_review_performance(e.id)
  order by (r.id is not null), e.name;
end $$;

-- The KPIs to score for one person and month, with the scores already given.
create function public.performance_review_form(p_employee_id uuid, p_period date)
returns table (kpi_id uuid, name text, name_local text, weight integer, score integer, comment text)
language plpgsql stable security definer set search_path = '' as $$
declare
  per date := date_trunc('month', coalesce(p_period, current_date))::date;
begin
  if not (select app.can_review_performance(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select k.id, k.name, k.name_local, k.weight,
         (select s.score from public.performance_scores s join public.performance_reviews r on r.id = s.review_id
          where r.employee_id = p_employee_id and r.period = per and s.kpi_name = k.name),
         (select r.comment from public.performance_reviews r where r.employee_id = p_employee_id and r.period = per)
  from public.employees e
  join public.kpis k on k.company_id = e.company_id and k.position_id = e.position_id and k.active
  where e.id = p_employee_id
  order by k.created_at, k.name;
end $$;

-- p_scores: {"<kpi id>": 0..100, ...}. Every active KPI of the employee's position must be scored.
create function public.submit_performance_review(p_employee_id uuid, p_period date, p_scores jsonb, p_comment text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  per date := date_trunc('month', coalesce(p_period, current_date))::date;
  rid uuid;
  k record;
  sc integer;
  n integer := 0;
  wsum numeric := 0;
  total numeric := 0;
  pct integer;
begin
  if not (select app.can_review_performance(p_employee_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if per > date_trunc('month', current_date)::date then raise exception 'that month has not started' using errcode = '22023'; end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then raise exception 'scores are required' using errcode = '22023'; end if;
  if not exists (select 1 from public.employees e join public.kpis kz on kz.position_id = e.position_id and kz.company_id = e.company_id and kz.active
                 where e.id = p_employee_id) then
    raise exception 'no KPIs for this position' using errcode = 'P0002';
  end if;
  for k in select kp.* from public.employees e join public.kpis kp on kp.position_id = e.position_id and kp.company_id = e.company_id and kp.active
           where e.id = p_employee_id order by kp.created_at, kp.name loop
    if not (p_scores ? k.id::text) or jsonb_typeof(p_scores -> k.id::text) <> 'number' then
      raise exception 'every KPI needs a score' using errcode = '22023';
    end if;
    sc := (p_scores ->> k.id::text)::numeric::int;
    if sc not between 0 and 100 then raise exception 'scores are 0 to 100' using errcode = '22023'; end if;
    wsum := wsum + k.weight;
    total := total + sc * k.weight;
  end loop;
  pct := round(total / wsum)::int;

  insert into public.performance_reviews (company_id, employee_id, period, overall_percent, comment, reviewed_by)
  values (cid, p_employee_id, per, pct, nullif(btrim(coalesce(p_comment, '')), ''), app.membership_id())
  on conflict (employee_id, period) do update
    set overall_percent = excluded.overall_percent, comment = excluded.comment, reviewed_by = excluded.reviewed_by, reviewed_at = now()
  returning id into rid;
  delete from public.performance_scores where review_id = rid;
  for k in select kp.* from public.employees e join public.kpis kp on kp.position_id = e.position_id and kp.company_id = e.company_id and kp.active
           where e.id = p_employee_id order by kp.created_at, kp.name loop
    n := n + 1;
    insert into public.performance_scores (company_id, review_id, position, kpi_name, kpi_name_local, weight, score)
    values (cid, rid, n, k.name, k.name_local, k.weight, (p_scores ->> k.id::text)::numeric::int);
  end loop;
  return pct;
end $$;

-- ---------- staff side ----------
-- The person's own KPIs with the score from the latest review that scored each.
create function public.my_kpis()
returns table (name text, name_local text, weight integer, last_score integer, last_period date)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select k.name, k.name_local, k.weight, ls.score, ls.period
  from public.employees e
  join public.kpis k on k.company_id = e.company_id and k.position_id = e.position_id and k.active
  left join lateral (select s.score, r.period from public.performance_scores s join public.performance_reviews r on r.id = s.review_id
                     where r.employee_id = eid and s.kpi_name = k.name order by r.period desc limit 1) ls on true
  where e.id = eid
  order by k.created_at, k.name;
end $$;

create function public.my_reviews()
returns table (period date, overall_percent integer, comment text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select r.period, r.overall_percent, r.comment, r.reviewed_at
  from public.performance_reviews r where r.employee_id = eid order by r.period desc limit 12;
end $$;

revoke execute on function public.save_kpi(uuid, uuid, text, text, integer, boolean) from public, anon;
revoke execute on function public.performance_review_list(date) from public, anon;
revoke execute on function public.performance_review_form(uuid, date) from public, anon;
revoke execute on function public.submit_performance_review(uuid, date, jsonb, text) from public, anon;
revoke execute on function public.my_kpis() from public, anon;
revoke execute on function public.my_reviews() from public, anon;
grant execute on function public.save_kpi(uuid, uuid, text, text, integer, boolean) to authenticated;
grant execute on function public.performance_review_list(date) to authenticated;
grant execute on function public.performance_review_form(uuid, date) to authenticated;
grant execute on function public.submit_performance_review(uuid, date, jsonb, text) to authenticated;
grant execute on function public.my_kpis() to authenticated;
grant execute on function public.my_reviews() to authenticated;
