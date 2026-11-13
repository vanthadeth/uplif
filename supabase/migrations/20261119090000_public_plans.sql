-- Landing page: the public price list. The plans table is closed to the API, so the signed-out landing page
-- reads prices through this one function. It returns only what a price card shows (name, prices, limits,
-- modules) for standard plans that are not archived. Custom packages (made for one customer) are never listed.
create function public.public_plans() returns table (
  code text, name text, price_month_cents integer, price_year_cents integer,
  max_companies integer, max_branches integer, max_users integer, modules text[]
)
language sql stable security definer set search_path = '' as $$
  select p.code, p.name, p.price_month_cents, p.price_year_cents, p.max_companies, p.max_branches, p.max_users, p.modules
  from public.plans p
  where p.kind = 'standard' and p.archived_at is null
  order by p.price_year_cents, p.name
$$;

revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;
