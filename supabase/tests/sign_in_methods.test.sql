-- Tests for migration 25: linking sign-in methods. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, phone) values
  ('f5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'g@test.local', null),
  ('f5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tg-777@telegram.uplif.invalid', null),
  ('f5000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'other@test.local', '+85512345678');
insert into auth.identities (user_id, provider, identity_data) values
  ('f5000000-0000-0000-0000-000000000001', 'google', '{"email":"g@test.local"}'),
  ('f5000000-0000-0000-0000-000000000002', 'email', '{}'),
  ('f5000000-0000-0000-0000-000000000003', 'google', '{"email":"other@test.local"}');
insert into public.telegram_links (user_id, telegram_id, name) values
  ('f5000000-0000-0000-0000-000000000001', '555', 'Dara'),
  ('f5000000-0000-0000-0000-000000000002', '777', 'Only Telegram');

create function pg_temp.as_user(p_uid uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true)
$f$;

-- the tables are closed to the API
select pg_temp.as_user('f5000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$select * from public.telegram_links$$, '42501', null, 'signed-in users cannot read telegram_links directly');
select throws_ok($$select * from public.telegram_link_intents$$, '42501', null, 'signed-in users cannot read link intents directly');
select is((public.my_sign_in_methods() -> 'google' ->> 'email'), 'g@test.local', 'google email is shown');
select is((public.my_sign_in_methods() -> 'telegram' ->> 'name'), 'Dara', 'telegram link is shown');
select is((public.my_sign_in_methods() ->> 'count')::int, 2, 'two methods counted');
select lives_ok($$select public.unlink_telegram()$$, 'can unlink telegram when google remains');
select is((public.my_sign_in_methods() ->> 'telegram'), null::text, 'telegram is gone after unlinking');
reset role;

select ok(not exists (select 1 from public.telegram_links where user_id = 'f5000000-0000-0000-0000-000000000001'), 'link row removed');

-- last method cannot be removed
select pg_temp.as_user('f5000000-0000-0000-0000-000000000002');
set local role authenticated;
select is((public.my_sign_in_methods() ->> 'count')::int, 1, 'a Telegram-only account counts one method');
select throws_ok($$select public.unlink_telegram()$$, 'P0001', 'last sign-in method', 'the last method cannot be unlinked');
reset role;
select ok(exists (select 1 from public.telegram_links where user_id = 'f5000000-0000-0000-0000-000000000002'), 'link still there');

-- phone counts
select pg_temp.as_user('f5000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((public.my_sign_in_methods() ->> 'phone'), '+85512345678', 'phone is shown');
select is((public.my_sign_in_methods() ->> 'count')::int, 2, 'google plus phone is two');
reset role;

-- link tickets: single use, hashed, short-lived, replaced by a new one
select pg_temp.as_user('f5000000-0000-0000-0000-000000000003');
set local role authenticated;
create temp table tok as select public.start_telegram_link() as t;
grant select on tok to public;
select ok((select length(t) from tok) >= 60, 'token is long and random');
select lives_ok($$select public.start_telegram_link()$$, 'asking again works');
reset role;
select is((select count(*) from public.telegram_link_intents where user_id = 'f5000000-0000-0000-0000-000000000003')::int, 1, 'a new ticket replaces the old one');
select ok(not exists (select 1 from public.telegram_link_intents where token_hash = (select t from tok)), 'the raw token is never stored');
select ok((select expires_at from public.telegram_link_intents where user_id = 'f5000000-0000-0000-0000-000000000003') <= now() + interval '10 minutes 5 seconds', 'ticket lasts 10 minutes');

-- signed-out callers are refused
set local role anon;
select throws_ok($$select public.start_telegram_link()$$, '42501', null, 'signed-out callers cannot start a link');
select throws_ok($$select public.my_sign_in_methods()$$, '42501', null, 'signed-out callers cannot list methods');
reset role;

-- one Telegram account, one user
select throws_ok($$insert into public.telegram_links (user_id, telegram_id) values ('f5000000-0000-0000-0000-000000000003', '777')$$, '23505', null, 'a Telegram account cannot belong to two users');

select * from finish();
rollback;
