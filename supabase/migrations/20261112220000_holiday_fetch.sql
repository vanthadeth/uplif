-- Migration 33: the yearly public-holiday fetch (slice 2).
-- On the last day of September, October, November and December a scheduled job asks the Edge Function holiday-fetch to
-- download next year's public holidays for every country where a company exists, and saves them as presets. A company's
-- own calendar is never touched: companies import presets themselves (migration 32).
--  * Presets from a source are replaced as a whole for that country and year, so a later run corrects an earlier one.
--    Presets entered by hand (source 'manual') are never replaced or removed by a fetch; a fetched day that falls on the
--    same date as a manual one is skipped.
--  * Every country of every run is logged. A country that fails (or that the source does not cover and has no manual
--    presets) raises an alert for platform staff, shown in the admin app; it clears when a later run succeeds or when
--    presets are entered by hand.
--  * The job asks for a run with a shared secret; see supabase/functions/holiday-fetch for the secrets to set.
-- Run migration 32 first.

create table public.holiday_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  forced boolean not null default false,
  status text not null default 'requested' check (status in ('requested', 'ok', 'partial', 'failed')),
  countries integer not null default 0,
  failed integer not null default 0,
  requested_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.holiday_fetch_log (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.holiday_fetch_runs (id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  year integer not null,
  status text not null check (status in ('ok', 'failed', 'unsupported')),
  holiday_count integer not null default 0,
  source text,
  error text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now()
);
create index holiday_fetch_log_run_idx on public.holiday_fetch_log (run_id);

-- One open alert per country and year; '*' stands for a whole run that never reported back.
create table public.holiday_fetch_alerts (
  country_code text not null check (country_code ~ '^([A-Z]{2}|\*)$'),
  year integer not null,
  last_error text check (last_error is null or length(last_error) <= 500),
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (country_code, year)
);

alter table public.holiday_fetch_runs enable row level security;
alter table public.holiday_fetch_runs force row level security;
alter table public.holiday_fetch_log enable row level security;
alter table public.holiday_fetch_log force row level security;
alter table public.holiday_fetch_alerts enable row level security;
alter table public.holiday_fetch_alerts force row level security;
revoke all on public.holiday_fetch_runs, public.holiday_fetch_log, public.holiday_fetch_alerts from public, anon, authenticated;
-- Writing presets and the fetch tables is done only through the service-role functions below and the platform calls.
revoke insert, update, delete, truncate on public.holiday_presets from public, anon, authenticated;

-- ---------- called by the Edge Function (service role only) ----------
-- Start (or continue) a run: returns the year and the countries to fetch.
create function public.holiday_begin_run(p_run_id uuid default null, p_year integer default null)
returns table (run_id uuid, year integer, countries text[])
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid := coalesce(p_run_id, gen_random_uuid());
  yr integer := coalesce(p_year, extract(year from current_date)::integer + 1);
begin
  if yr < 2000 or yr > 2100 then raise exception 'year not allowed' using errcode = 'P0001'; end if;
  insert into public.holiday_fetch_runs (id, year, forced) values (rid, yr, p_run_id is null) on conflict (id) do nothing;
  return query
    select rid, yr, coalesce(array_agg(distinct c.country_code order by c.country_code), '{}'::text[]) from public.companies c;
end $$;

-- Save one country's result. p_holidays: [{"date": "2027-01-01", "name": "...", "name_local": "..."}].
create function public.holiday_record_fetch(
  p_run uuid, p_country text, p_year integer, p_status text, p_source text, p_holidays jsonb, p_error text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sys constant uuid := '00000000-0000-0000-0000-000000000000';
  n integer := 0;
  has_manual boolean;
  err text := left(p_error, 500);
begin
  if p_country !~ '^[A-Z]{2}$' or p_status not in ('ok', 'failed', 'unsupported') then
    raise exception 'bad input' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.holiday_fetch_runs where id = p_run) then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  select exists (select 1 from public.holiday_presets where country_code = p_country and source = 'manual'
                   and extract(year from holiday_date) = p_year) into has_manual;

  if p_status = 'ok' then
    if p_source not in ('nager') or jsonb_typeof(p_holidays) <> 'array' or jsonb_array_length(p_holidays) > 100 then
      raise exception 'bad holidays' using errcode = 'P0001';
    end if;
    -- All or nothing: the old fetched days go and the new ones come in within this one call.
    delete from public.holiday_presets where country_code = p_country and source = p_source and extract(year from holiday_date) = p_year;
    insert into public.holiday_presets (country_code, holiday_date, name, name_local, source)
    select distinct on ((x ->> 'date')::date, left(btrim(x ->> 'name'), 120))
           p_country, (x ->> 'date')::date, left(btrim(x ->> 'name'), 120), nullif(left(btrim(coalesce(x ->> 'name_local', '')), 120), ''), p_source
    from jsonb_array_elements(p_holidays) x
    where extract(year from (x ->> 'date')::date) = p_year and length(btrim(coalesce(x ->> 'name', ''))) > 0
      and not exists (select 1 from public.holiday_presets m where m.country_code = p_country and m.source = 'manual' and m.holiday_date = (x ->> 'date')::date)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 and not has_manual then
      -- A source that answers with nothing is as useless as one that is down.
      p_status := 'failed'; err := 'the source returned no holidays';
    end if;
  end if;

  insert into public.holiday_fetch_log (run_id, country_code, year, status, holiday_count, source, error)
    values (p_run, p_country, p_year, p_status, n, p_source, err);

  if p_status = 'ok' or has_manual then
    delete from public.holiday_fetch_alerts where country_code = p_country and year = p_year;
  else
    insert into public.holiday_fetch_alerts (country_code, year, last_error) values (p_country, p_year, coalesce(err, p_status))
    on conflict (country_code, year) do update set
      last_error = excluded.last_error, occurrences = public.holiday_fetch_alerts.occurrences + 1, last_seen = now(), acknowledged_at = null;
    perform app.platform_write_log(sys, 'holidays.fetch_failed', null, jsonb_build_object('country', p_country, 'year', p_year, 'reason', coalesce(err, p_status)));
  end if;
end $$;

create function public.holiday_finish_run(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  total integer;
  bad integer;
begin
  select count(*), count(*) filter (where status <> 'ok') into total, bad from public.holiday_fetch_log where run_id = p_run;
  update public.holiday_fetch_runs set countries = total, failed = bad, finished_at = now(),
    status = case when bad = 0 then 'ok' when bad = total then 'failed' else 'partial' end
  where id = p_run;
  perform app.platform_write_log('00000000-0000-0000-0000-000000000000'::uuid, 'holidays.fetch_run', null,
    jsonb_build_object('run', p_run, 'countries', total, 'failed', bad));
end $$;

-- The whole run could not even start (or never reported back).
create function app.holiday_alert_run(p_year integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.holiday_fetch_alerts (country_code, year, last_error) values ('*', p_year, left(p_reason, 500))
  on conflict (country_code, year) do update set last_error = excluded.last_error,
    occurrences = public.holiday_fetch_alerts.occurrences + 1, last_seen = now(), acknowledged_at = null;
  perform app.platform_write_log('00000000-0000-0000-0000-000000000000'::uuid, 'holidays.run_failed', null,
    jsonb_build_object('year', p_year, 'reason', left(p_reason, 500)));
end $$;
revoke all on function app.holiday_alert_run(integer, text) from public, anon, authenticated;

revoke all on function public.holiday_begin_run(uuid, integer) from public, anon, authenticated;
revoke all on function public.holiday_record_fetch(uuid, text, integer, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.holiday_finish_run(uuid) from public, anon, authenticated;
grant execute on function public.holiday_begin_run(uuid, integer) to service_role;
grant execute on function public.holiday_record_fetch(uuid, text, integer, text, text, jsonb, text) to service_role;
grant execute on function public.holiday_finish_run(uuid) to service_role;

-- ---------- the scheduled job ----------
-- Runs every day from the 28th to the 31st of September to December and acts only on the last day of the month.
-- p_force skips that check (for a test run from the SQL editor: select app.holiday_fetch_tick(true)).
-- It needs the secret 'holiday_cron_secret' in Vault and the pg_net extension; without them it raises an alert.
create function app.holiday_fetch_tick(p_force boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  yr integer := extract(year from current_date)::integer + 1;
  rid uuid := gen_random_uuid();
  secret text;
  url constant text := 'https://ksvidjhtyvwfpxgwvexk.supabase.co/functions/v1/holiday-fetch';
begin
  if not p_force and (current_date + 1) <> date_trunc('month', current_date + 1)::date then
    return 'not the last day of the month';
  end if;
  if not p_force and extract(month from current_date) not in (9, 10, 11, 12) then
    return 'not a fetch month';
  end if;
  begin
    if to_regnamespace('net') is null then raise exception 'the pg_net extension is not enabled'; end if;
    if to_regclass('vault.decrypted_secrets') is null then raise exception 'Vault is not available'; end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'holiday_cron_secret';
    if secret is null then raise exception 'the Vault secret holiday_cron_secret is not set'; end if;
    insert into public.holiday_fetch_runs (id, year, forced) values (rid, yr, p_force);
    execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
      using url, jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret), jsonb_build_object('run_id', rid, 'year', yr);
  exception when others then
    perform app.holiday_alert_run(yr, 'could not start the fetch: ' || sqlerrm);
    return 'failed: ' || sqlerrm;
  end;
  return 'requested ' || rid::text;
end $$;
revoke all on function app.holiday_fetch_tick(boolean) from public, anon, authenticated;

-- A run that was requested but never finished by the next morning means the Edge Function did not do its work.
create function app.holiday_fetch_watchdog() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id, year from public.holiday_fetch_runs where status = 'requested' and requested_at < now() - interval '6 hours' loop
    update public.holiday_fetch_runs set status = 'failed', finished_at = now() where id = r.id;
    perform app.holiday_alert_run(r.year, 'the fetch was requested but never reported back; check the holiday-fetch function logs');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.holiday_fetch_watchdog() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available; schedule app.holiday_fetch_tick() and app.holiday_fetch_watchdog() by hand';
  end;
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice 'pg_net is not available; enable it in Database > Extensions before the first run';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('uplif-holiday-fetch', '0 2 28-31 9-12 *', 'select app.holiday_fetch_tick()');
    perform cron.schedule('uplif-holiday-watchdog', '0 12 * 9-12,1 *', 'select app.holiday_fetch_watchdog()');
  end if;
end $$;

-- ---------- for the admin app ----------
create function public.platform_holiday_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  yr integer := extract(year from current_date)::integer + 1;
begin
  perform app.assert_platform_admin();
  return jsonb_build_object(
    'next_year', yr,
    'alerts', coalesce((select jsonb_agg(to_jsonb(a) order by a.last_seen desc) from public.holiday_fetch_alerts a), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc)
                      from (select * from public.holiday_fetch_runs order by requested_at desc limit 12) r), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
          'country_code', c.country_code, 'companies', c.n,
          'presets', (select count(*) from public.holiday_presets p where p.country_code = c.country_code and extract(year from p.holiday_date) = yr),
          'manual', (select count(*) from public.holiday_presets p where p.country_code = c.country_code and p.source = 'manual' and extract(year from p.holiday_date) = yr),
          'last_status', (select l.status from public.holiday_fetch_log l where l.country_code = c.country_code order by l.id desc limit 1),
          'last_error', (select l.error from public.holiday_fetch_log l where l.country_code = c.country_code order by l.id desc limit 1),
          'last_at', (select l.created_at from public.holiday_fetch_log l where l.country_code = c.country_code order by l.id desc limit 1)
        ) order by c.country_code)
      from (select country_code, count(*) n from public.companies group by country_code) c), '[]'::jsonb));
end $$;

create function public.platform_ack_holiday_alert(p_country text, p_year integer) returns void
language plpgsql security definer set search_path = '' as $$
declare admin uuid := app.assert_platform_admin();
begin
  update public.holiday_fetch_alerts set acknowledged_at = now() where country_code = p_country and year = p_year and acknowledged_at is null;
  if found then
    perform app.platform_write_log(admin, 'holidays.alert_ack', null, jsonb_build_object('country', p_country, 'year', p_year));
  end if;
end $$;

revoke all on function public.platform_holiday_overview() from public, anon;
revoke all on function public.platform_ack_holiday_alert(text, integer) from public, anon;
grant execute on function public.platform_holiday_overview() to authenticated;
grant execute on function public.platform_ack_holiday_alert(text, integer) to authenticated;
