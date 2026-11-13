-- Code of conduct (UPLIF Me, Learn hub). It reuses the company policy engine: same versions, same confirmation,
-- same "who confirmed" list, same permission (learn.policy.manage). The only addition is a kind on each item,
-- 'policy' (default, what every existing row is) or 'conduct', so staff see them as two separate tiles.

alter table public.company_policies
  add column kind text not null default 'policy' check (kind in ('policy', 'conduct'));

-- The kind is fixed when an item is created.
create function app.forbid_policy_kind_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'kind cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger immutable_kind_company_policies before update on public.company_policies
  for each row execute function app.forbid_policy_kind_change();

-- ---------- save_policy gets a kind (used only when creating) ----------
drop function public.save_policy(uuid, text, text, text, text);
create function public.save_policy(p_id uuid, p_title text, p_title_local text, p_body text, p_body_local text, p_kind text default 'policy')
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
  if p_kind is null or p_kind not in ('policy', 'conduct') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if pid is null then
    insert into public.company_policies (company_id, title, title_local, kind, created_by)
    values (cid, btrim(p_title), nullif(btrim(coalesce(p_title_local, '')), ''), p_kind, app.membership_id()) returning id into pid;
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
revoke execute on function public.save_policy(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_policy(uuid, text, text, text, text, text) to authenticated;

-- ---------- my_policies returns the kind ----------
drop function public.my_policies();
create function public.my_policies()
returns table (policy_id uuid, kind text, version_id uuid, version integer, title text, title_local text, body text, body_local text,
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
  select p.id, p.kind, v.id, v.version, p.title, p.title_local, v.body, v.body_local, v.published_at, a.acknowledged_at,
         exists (select 1 from public.policy_acknowledgements a2 join public.policy_versions v2 on v2.id = a2.version_id
                 where v2.policy_id = p.id and a2.employee_id = eid and v2.version < v.version)
  from public.company_policies p
  join lateral (select * from public.policy_versions x where x.policy_id = p.id order by x.version desc limit 1) v on true
  left join public.policy_acknowledgements a on a.version_id = v.id and a.employee_id = eid
  where p.company_id = cid and not p.archived
  order by (a.acknowledged_at is null) desc, v.published_at desc;
end $$;
revoke execute on function public.my_policies() from public, anon;
grant execute on function public.my_policies() to authenticated;
