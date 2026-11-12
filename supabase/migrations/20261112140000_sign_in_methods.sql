-- Migration 25: one person, several ways to sign in (Google, Telegram, phone).
-- Google and phone are linked through Supabase Auth itself (linkIdentity / phone change). Telegram is our own
-- sign-in (Edge Function telegram-login), so its link lives here: one Telegram account belongs to one user.

create table public.telegram_links (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  telegram_id text not null unique check (telegram_id ~ '^[0-9]+$'),
  name        text,
  username    text,
  linked_at   timestamptz not null default now()
);
-- A short-lived, single-use ticket that says "this signed-in user wants to link a Telegram account".
-- Only the hash is stored; the raw token is shown once to the user's browser.
create table public.telegram_link_intents (
  token_hash text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create index telegram_link_intents_user_idx on public.telegram_link_intents (user_id);

alter table public.telegram_links enable row level security;
alter table public.telegram_links force row level security;
alter table public.telegram_link_intents enable row level security;
alter table public.telegram_link_intents force row level security;
revoke all on public.telegram_links, public.telegram_link_intents from public, anon, authenticated;
-- Only the Edge Function (service role) reads and writes these tables directly.
grant select, insert, update, delete on public.telegram_links, public.telegram_link_intents to service_role;

-- Signed-in user asks to link Telegram: returns a token that is good for 10 minutes and one use.
create function public.start_telegram_link() returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); tok text;
begin
  if uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.telegram_link_intents where user_id = uid or expires_at < now();
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.telegram_link_intents (token_hash, user_id, expires_at)
    values (encode(sha256(convert_to(tok, 'utf8')), 'hex'), uid, now() + interval '10 minutes');
  return tok;
end $$;
revoke all on function public.start_telegram_link() from public, anon;
grant execute on function public.start_telegram_link() to authenticated;

-- The sign-in methods of the signed-in user, for the account page.
create function public.my_sign_in_methods() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); g record; t record; p text;
begin
  if uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select i.id, i.identity_data ->> 'email' as email into g from auth.identities i where i.user_id = uid and i.provider = 'google' limit 1;
  select l.name, l.username, l.linked_at into t from public.telegram_links l where l.user_id = uid;
  select u.phone into p from auth.users u where u.id = uid;
  return jsonb_build_object(
    'google',   case when g.id is null then null else jsonb_build_object('email', g.email) end,
    'telegram', case when t.linked_at is null then null else jsonb_build_object('name', t.name, 'username', t.username, 'linked_at', t.linked_at) end,
    'phone',    nullif(p, ''),
    'count',    (g.id is not null)::int + (t.linked_at is not null)::int + (coalesce(p, '') <> '')::int
  );
end $$;
revoke all on function public.my_sign_in_methods() from public, anon;
grant execute on function public.my_sign_in_methods() to authenticated;

-- Remove the Telegram link, but never the last way in. (Google and phone count; the placeholder email Telegram
-- accounts carry does not, because nobody can receive mail there.)
create function public.unlink_telegram() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); m jsonb;
begin
  if uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  m := public.my_sign_in_methods();
  if (m ->> 'telegram') is null then return; end if;
  if (m ->> 'count')::int < 2 then raise exception 'last sign-in method' using errcode = 'P0001'; end if;
  delete from public.telegram_links where user_id = uid;
end $$;
revoke all on function public.unlink_telegram() from public, anon;
grant execute on function public.unlink_telegram() to authenticated;

-- For the Edge Function only: which user owns this Telegram account? The link table first; otherwise the
-- placeholder-address account that Telegram sign-in created before links existed.
create function public.telegram_find_user(p_tid text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select l.user_id from public.telegram_links l where l.telegram_id = p_tid),
    (select u.id from auth.users u where u.email = 'tg-' || p_tid || '@telegram.uplif.invalid')
  )
$$;
revoke all on function public.telegram_find_user(text) from public, anon, authenticated;
grant execute on function public.telegram_find_user(text) to service_role;
