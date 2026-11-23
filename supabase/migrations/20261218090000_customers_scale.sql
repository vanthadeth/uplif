-- Customers at scale (1000+ per company): paged list, group counts, offline delta sync, indexes.
-- Additive. List/sync functions compute the caller's read scope once per call instead of per row.

alter table public.customers add column if not exists last_visit_at timestamptz;

create index if not exists customers_name_page_idx on public.customers (company_id, name, id);
create index if not exists customers_sync_idx on public.customers (company_id, updated_at, id);
create index if not exists customers_visit_idx on public.customers (company_id, last_visit_at);
create index if not exists customer_addresses_province_idx
  on public.customer_addresses (company_id, province, customer_id) where archived_at is null;

create or replace function app.my_customer_scope()
returns text language sql stable security definer set search_path = '' as $$
  select case max(r)
           when 4 then 'company' when 3 then 'branch' when 2 then 'team' when 1 then 'own' end
  from (
    select case app.permission_scope(k)
             when 'company' then 4 when 'branch' then 3 when 'team' then 2 when 'own' then 1 else 0 end as r
    from unnest(array['customers.customer.read', 'sales.customer.read']) k
  ) t
  where r > 0
$$;

create or replace function app.customer_vis_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id
  from public.customers c,
       (select app.my_customer_scope() as s, app.my_employee_id() as e) x
  where c.company_id = app.company_id()
    and (select app.is_active_member())
    and x.s is not null
    and (   x.s = 'company'
         or (x.s = 'branch' and c.branch_id = any (app.my_branch_ids()))
         or (x.s = 'team' and (c.owner_employee_id in (select app.team_employee_ids())
                               or c.created_by_employee_id in (select app.team_employee_ids())))
         or (x.s = 'own' and (c.owner_employee_id = x.e or c.created_by_employee_id = x.e))
         or exists (select 1 from public.customer_assignments a
                    where a.customer_id = c.id and a.employee_id = x.e and a.ended_at is null))
$$;

create or replace function public.customers_list(
  p_q text default null, p_status text default null, p_group uuid default null,
  p_province text default null, p_type text default null, p_owner uuid default null,
  p_field_option uuid default null, p_visit text default null,
  p_sort text default 'name', p_cursor jsonb default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
  v_k text := p_cursor ->> 'k';
  v_id uuid := nullif(p_cursor ->> 'id', '')::uuid;
  v_rows jsonb; v_more boolean; v_next jsonb;
begin
  if app.my_customer_scope() is null then raise exception 'permission denied'; end if;
  if p_sort not in ('name', 'recent') then raise exception 'bad sort'; end if;

  with f as (
    select c.*
    from public.customers c
    join app.customer_vis_ids() v(id) on v.id = c.id
    where c.merged_into_id is null
      and (case when p_status is null then c.status <> 'archived' else c.status = p_status end)
      and (p_group is null or c.group_id = p_group)
      and (p_type is null or c.type = p_type)
      and (p_owner is null or c.owner_employee_id = p_owner)
      and (v_q = '' or c.search_text like '%' || v_q || '%'
           or exists (select 1 from public.customer_contact_channels ch
                      where ch.customer_id = c.id and ch.phone_normalized is not null
                        and ch.phone_normalized = app.norm_phone(p_q)))
      and (p_province is null or exists (select 1 from public.customer_addresses a
                                         where a.customer_id = c.id and a.archived_at is null and a.province = p_province))
      and (p_field_option is null or exists (select 1 from public.customer_field_values fv
                                             where fv.customer_id = c.id and fv.option_id = p_field_option))
      and (p_visit is null
           or (p_visit = 'never' and c.last_visit_at is null)
           or (p_visit = '30' and c.last_visit_at >= now() - interval '30 days')
           or (p_visit = '90' and c.last_visit_at >= now() - interval '90 days')
           or (p_visit = 'over90' and c.last_visit_at < now() - interval '90 days'))
      and (v_k is null
           or (p_sort = 'name' and (c.name, c.id) > (v_k, v_id))
           or (p_sort = 'recent' and (c.updated_at, c.id) < (v_k::timestamptz, v_id)))
    order by case when p_sort = 'name' then c.name end asc, case when p_sort = 'name' then c.id end asc,
             case when p_sort = 'recent' then c.updated_at end desc, case when p_sort = 'recent' then c.id end desc
    limit v_lim + 1
  ), ranked as (
    select f.*, row_number() over (
             order by case when p_sort = 'name' then f.name end asc, case when p_sort = 'name' then f.id end asc,
                      case when p_sort = 'recent' then f.updated_at end desc, case when p_sort = 'recent' then f.id end desc) rn
    from f
  ), page as (select * from ranked where rn <= v_lim)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'name_local', p.name_local, 'status', p.status,
           'type', p.type, 'group_id', p.group_id, 'phone', p.phone_primary,
           'owner_employee_id', p.owner_employee_id, 'last_visit_at', p.last_visit_at,
           'updated_at', p.updated_at,
           'province', (select a.province from public.customer_addresses a
                        where a.customer_id = p.id and a.archived_at is null
                        order by a.is_default desc, a.created_at limit 1))
         order by p.rn), '[]'::jsonb),
         (select count(*) > v_lim from ranked)
    into v_rows, v_more
  from page p;

  if v_more then
    v_next := (select case when p_sort = 'name'
                           then jsonb_build_object('k', r ->> 'name', 'id', r ->> 'id')
                           else jsonb_build_object('k', r ->> 'updated_at', 'id', r ->> 'id') end
               from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n desc limit 1);
  end if;
  return jsonb_build_object('rows', v_rows, 'next', v_next);
end $$;

create or replace function public.customers_group_counts(p_by text, p_status text default null)
returns table(key text, label text, n bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.my_customer_scope() is null then raise exception 'permission denied'; end if;
  return query
  with base as (
    select c.* from public.customers c join app.customer_vis_ids() v(id) on v.id = c.id
    where c.merged_into_id is null
      and (case when p_status is null then c.status <> 'archived' else c.status = p_status end)
  )
  select g.k, g.l, count(*)::bigint from (
    select case p_by
             when 'province' then (select a.province from public.customer_addresses a
                                   where a.customer_id = b.id and a.archived_at is null
                                   order by a.is_default desc, a.created_at limit 1)
             when 'group' then b.group_id::text
             when 'type' then b.type
             when 'status' then b.status
             when 'rep' then b.owner_employee_id::text
             when 'visit' then case when b.last_visit_at is null then 'never'
                                    when b.last_visit_at >= now() - interval '30 days' then '30'
                                    when b.last_visit_at >= now() - interval '90 days' then '90'
                                    else 'over90' end
             else null end as k,
           case when p_by = 'group' then (select gr.name from public.customer_groups gr where gr.id = b.group_id) end as l
    from base b
  ) g
  where p_by in ('province', 'group', 'type', 'status', 'rep', 'visit')
  group by g.k, g.l
  order by count(*) desc, g.k;
end $$;

create or replace function public.customers_sync(
  p_since timestamptz default null, p_after_id uuid default null, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_rows jsonb; v_more boolean; v_next jsonb;
begin
  if app.my_customer_scope() is null then raise exception 'permission denied'; end if;

  with f as (
    select c.* from public.customers c
    join app.customer_vis_ids() v(id) on v.id = c.id
    where (p_since is null and c.status <> 'archived' and c.merged_into_id is null
           or p_since is not null)
      and (p_since is null or (c.updated_at, c.id) > (p_since, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by c.updated_at, c.id
    limit v_lim + 1
  ), page as (select * from f order by updated_at, id limit v_lim)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'name_local', p.name_local, 'status', p.status,
           'type', p.type, 'group_id', p.group_id, 'phone', p.phone_primary,
           'owner_employee_id', p.owner_employee_id, 'branch_id', p.branch_id,
           'merged_into_id', p.merged_into_id, 'archived_at', p.archived_at,
           'last_visit_at', p.last_visit_at, 'updated_at', p.updated_at, 'latitude', p.latitude, 'longitude', p.longitude,
           'province', (select a.province from public.customer_addresses a
                        where a.customer_id = p.id and a.archived_at is null
                        order by a.is_default desc, a.created_at limit 1))
         order by p.updated_at, p.id), '[]'::jsonb),
         (select count(*) > v_lim from f)
    into v_rows, v_more
  from page p;

  if jsonb_array_length(v_rows) > 0 then
    v_next := (select jsonb_build_object('since', r ->> 'updated_at', 'id', r ->> 'id')
               from jsonb_array_elements(v_rows) with ordinality t(r, n) order by n desc limit 1);
  else
    v_next := case when p_since is null then null else jsonb_build_object('since', p_since, 'id', p_after_id) end;
  end if;
  return jsonb_build_object('rows', v_rows, 'next', v_next, 'more', v_more, 'server_time', now());
end $$;

create or replace function public.customers_sync_ids()
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
begin
  if app.my_customer_scope() is null then raise exception 'permission denied'; end if;
  return coalesce((select array_agg(c.id) from public.customers c
                   join app.customer_vis_ids() v(id) on v.id = c.id
                   where c.status <> 'archived' and c.merged_into_id is null), '{}');
end $$;

revoke all on function app.my_customer_scope(), app.customer_vis_ids() from public, anon, authenticated;
revoke all on function public.customers_list(text,text,uuid,text,text,uuid,uuid,text,text,jsonb,int),
  public.customers_group_counts(text,text), public.customers_sync(timestamptz,uuid,int),
  public.customers_sync_ids() from public, anon;
grant execute on function public.customers_list(text,text,uuid,text,text,uuid,uuid,text,text,jsonb,int),
  public.customers_group_counts(text,text), public.customers_sync(timestamptz,uuid,int),
  public.customers_sync_ids() to authenticated;
