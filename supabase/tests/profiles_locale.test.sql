-- Profile locale accepts language codes and rejects junk. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'l1@test.local'),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'l2@test.local'),
  ('c1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'l3@test.local');

select lives_ok($$insert into public.profiles (user_id, full_name, locale) values ('c1000000-0000-0000-0000-000000000001', 'A', 'th')$$, 'th is accepted');
select lives_ok($$insert into public.profiles (user_id, full_name, locale) values ('c1000000-0000-0000-0000-000000000002', 'B', 'zh-CN')$$, 'zh-CN is accepted');
select throws_ok($$insert into public.profiles (user_id, full_name, locale) values ('c1000000-0000-0000-0000-000000000003', 'C', 'Thai!')$$, '23514', null, 'junk is rejected');
select throws_ok($$update public.profiles set locale = '' where user_id = 'c1000000-0000-0000-0000-000000000001'$$, '23514', null, 'empty is rejected');
select is((select locale from public.profiles where user_id = 'c1000000-0000-0000-0000-000000000001'), 'th', 'stored as given');

select string_agg(t, ' | ') as result from finish() t;
rollback;
