-- Phone push for UPLIF Me. A phone that turns alerts on saves its push address; when a notification is created the database
-- asks the Edge Function push-send (same shared-secret pattern as holiday-fetch) to ring that person's phones.
--  * A push address is private to the person who saved it. Nobody reads or writes the table directly.
--  * The push message itself carries no details (no names, scores or dates), only "you have a new update", in the person's
--    language, so nothing sensitive shows on a locked screen. The details are in the app.
--  * No subscription, no Vault secret, or no pg_net: nothing happens and the notification is still saved. A failed push never
--    blocks the thing that caused it (a leave decision, a review).
--  * A person keeps at most 10 devices; the oldest is dropped. An address the push service reports as gone is removed.
-- Needs, in Vault: a secret named push_secret (the same text as the function secret PUSH_SECRET).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  endpoint text not null unique check (length(endpoint) between 20 and 2000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index push_subscriptions_employee_idx on public.push_subscriptions (employee_id, created_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

-- ---------- the phone ----------
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  eid uuid := app.my_employee_id();
  cid uuid := app.company_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception 'bad address' using errcode = '22023'; end if;
  insert into public.push_subscriptions (company_id, employee_id, endpoint, p256dh, auth, user_agent)
  values (cid, eid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set company_id = excluded.company_id, employee_id = excluded.employee_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where employee_id = eid order by created_at desc offset 10);
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and employee_id = eid;
end $$;

-- Is this phone's address saved for the caller?
create function public.my_push_registered(p_endpoint text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and employee_id = eid);
end $$;

revoke all on function public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text), public.my_push_registered(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text), public.my_push_registered(text) to authenticated;

-- ---------- the sender (service role only, called by the Edge Function) ----------
create function public.push_targets(p_notification_id uuid)
returns table (endpoint text, p256dh text, auth text, locale text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth, coalesce(p.locale, 'en')
  from public.notifications n
  join public.push_subscriptions s on s.employee_id = n.employee_id
  left join public.employees e on e.id = n.employee_id
  left join public.memberships m on m.id = e.membership_id
  left join public.profiles p on p.user_id = m.user_id
  where n.id = p_notification_id
$$;

create function public.push_drop_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;
revoke all on function public.push_targets(uuid), public.push_drop_subscription(text) from public, anon, authenticated;
grant execute on function public.push_targets(uuid), public.push_drop_subscription(text) to service_role;

-- ---------- ask the function to send ----------
create function app.push_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  url constant text := 'https://ksvidjhtyvwfpxgwvexk.supabase.co/functions/v1/push-send';
begin
  if not exists (select 1 from public.push_subscriptions s where s.employee_id = new.employee_id) then return new; end if;
  begin
    if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return new; end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'push_secret';
    if secret is null then return new; end if;
    execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
      using url, jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), jsonb_build_object('notification_id', new.id);
  exception when others then
    null; -- a failed push never blocks the event that caused it
  end;
  return new;
end $$;
revoke all on function app.push_notify() from public, anon, authenticated;
create trigger push_notify after insert on public.notifications for each row execute function app.push_notify();
