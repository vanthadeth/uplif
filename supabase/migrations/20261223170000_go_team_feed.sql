-- UPLIF Go, manager team feed (canvas slice 5).
-- One read function: today's visits and calls by the people the caller manages, plus their overdue reminders.
-- Who counts as "managed" follows the same scope as manager comments (sales.timeline.comment): company, team or branch.
-- A caller without that permission gets allowed = false and nothing else.
create function public.sales_team_feed(p_day date default null, p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); sc text; d date := coalesce(p_day, (now() at time zone 'utc')::date); items jsonb; nv int; nc int; od jsonb;
begin
  if not (select app.is_active_member()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not app.module_enabled(cid, 'field_sales') then raise exception 'module not in plan: field_sales' using errcode = 'P0001'; end if;
  sc := app.permission_scope('sales.timeline.comment');
  if sc is null or sc = 'own' then return jsonb_build_object('allowed', false); end if;

  select coalesce(jsonb_agg(x order by x.occurred_at desc), '[]'::jsonb), count(*) filter (where x.kind = 'visit'), count(*) filter (where x.kind = 'call')
    into items, nv, nc
  from (
    select ev.id, ev.kind, ev.body, ev.occurred_at, ev.detail, ev.customer_id, c.name as customer_name, c.name_local as customer_name_local,
           ev.author_employee_id, au.name as author_name, au.name_local as author_name_local
    from public.customer_events ev
    join public.customers c on c.company_id = ev.company_id and c.id = ev.customer_id
    left join public.employees au on au.id = ev.author_employee_id and au.company_id = ev.company_id
    where ev.company_id = cid and ev.kind in ('visit', 'call') and (ev.occurred_at at time zone 'utc')::date = d
      and app.customer_in_scope('sales.timeline.comment', c.owner_employee_id, c.created_by_employee_id, c.branch_id)
    order by ev.occurred_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date, 'customer_id', t.customer_id,
           'customer_name', c.name, 'customer_name_local', c.name_local, 'employee_id', t.employee_id,
           'employee_name', e.name, 'employee_name_local', e.name_local) order by t.due_date), '[]'::jsonb)
    into od
  from public.sales_tasks t
  join public.employees e on e.company_id = t.company_id and e.id = t.employee_id
  left join public.customers c on c.company_id = t.company_id and c.id = t.customer_id
  where t.company_id = cid and t.done_at is null and t.due_date < d
    and (sc = 'company' or (sc = 'team' and t.employee_id in (select app.team_employee_ids())) or (sc = 'branch' and e.branch_id = any (app.my_branch_ids())));

  return jsonb_build_object('allowed', true, 'day', d, 'visits', nv, 'calls', nc, 'items', items, 'overdue', od);
end $$;
revoke execute on function public.sales_team_feed(date, integer) from public, anon;
grant execute on function public.sales_team_feed(date, integer) to authenticated;
