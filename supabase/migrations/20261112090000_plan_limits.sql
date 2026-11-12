-- Migration 20: plan limits are enforced by the database, not just shown.
-- An owner account's plan caps its companies, branches per company, and users (active members plus pending invitations
-- across all its companies). Going over is refused with a clear message: "plan limit: companies|branches|users".
-- Only additions are blocked. An account already over a limit keeps what it has (a plan change refuses such an
-- account anyway) and can get back under by removing things. Admin and service tooling (no signed-in user, or no
-- subscription row) is not blocked. A company's first branch and first member are created before the account owns
-- the company, so they pass; every plan allows at least one of each.

-- The plan that applies to the account that owns a company, or null when there is none to apply.
create function app.company_plan(p_company uuid) returns public.plans
language sql stable security definer set search_path = '' as $$
  select p.* from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.owner_user_id = app.company_owner_user(p_company)
$$;
revoke all on function app.company_plan(uuid) from public, anon, authenticated;

-- ---------- companies: how many one account may own ----------
create function app.limit_companies() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  pl public.plans;
begin
  if uid is null then return new; end if;
  select p.* into pl from public.subscriptions s join public.plans p on p.id = s.plan_id where s.owner_user_id = uid;
  if not found then return new; end if;
  if (select count(*) from app.owned_company_ids(uid)) >= pl.max_companies then
    raise exception 'plan limit: companies' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger companies_plan_limit before insert on public.companies
  for each row execute function app.limit_companies();

-- ---------- branches: per company ----------
create function app.limit_branches() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pl public.plans;
begin
  if (select auth.uid()) is null then return new; end if;
  pl := app.company_plan(new.company_id);
  if pl.id is null or pl.max_branches is null then return new; end if;
  if (select count(*) from public.branches b where b.company_id = new.company_id) >= pl.max_branches then
    raise exception 'plan limit: branches' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger branches_plan_limit before insert on public.branches
  for each row execute function app.limit_branches();

-- ---------- users: active members and pending invitations, across the owner's companies ----------
create function app.owner_user_count(p_company uuid, p_with_pending boolean) returns integer
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.memberships m where m.status = 'active' and m.company_id in (select app.owned_company_ids(app.company_owner_user(p_company))))
       + case when p_with_pending then (select count(*)::int from public.invitations i where i.status = 'pending' and i.expires_at > now()
           and i.company_id in (select app.owned_company_ids(app.company_owner_user(p_company)))) else 0 end
$$;
revoke all on function app.owner_user_count(uuid, boolean) from public, anon, authenticated;

-- A new invitation reserves a seat.
create function app.limit_users_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pl public.plans;
begin
  if (select auth.uid()) is null then return new; end if;
  pl := app.company_plan(new.company_id);
  if pl.id is null then return new; end if;
  if app.owner_user_count(new.company_id, true) >= pl.max_users then
    raise exception 'plan limit: users' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invitations_plan_limit before insert on public.invitations
  for each row execute function app.limit_users_invite();

-- A member who joins or is switched back to active takes a seat. Accepting an invitation uses the seat the
-- invitation already reserved, so a join only has to fit among active members; reactivating a suspended member
-- has no reserved seat, so pending invitations count too.
create function app.limit_users_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pl public.plans;
begin
  if (select auth.uid()) is null or new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  pl := app.company_plan(new.company_id);
  if pl.id is null then return new; end if;
  if app.owner_user_count(new.company_id, tg_op = 'UPDATE') >= pl.max_users then
    raise exception 'plan limit: users' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger memberships_plan_limit before insert or update of status on public.memberships
  for each row execute function app.limit_users_member();
