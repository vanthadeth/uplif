-- Translation community: voting, pinning, privacy and access. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't1@test.local'),
  ('d1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't2@test.local'),
  ('d1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rv@test.local');
insert into public.profiles (user_id, full_name) values
  ('d1000000-0000-0000-0000-000000000001', 'Dara Sok'), ('d1000000-0000-0000-0000-000000000002', 'Vanna Chea'),
  ('d1000000-0000-0000-0000-000000000003', 'Reviewer Person');
insert into public.i18n_languages (code, native_name, english_name, date_tag) values ('xx', 'Test', 'Test', 'xx');
insert into public.i18n_strings (key, source_text, position) values ('t.a', 'Hello {name}', 9001), ('t.b', 'Save', 9002);
insert into public.i18n_reviewers (language_code, user_id) values ('xx', 'd1000000-0000-0000-0000-000000000003');
insert into public.i18n_suggestions (language_code, string_key, text, origin) values ('xx', 't.a', 'machine {name}', 'machine');

create function pg_temp.as_user(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(int) to public;

-- Nobody touches the tables directly
select pg_temp.as_user(1);
select throws_ok($$select count(*) from public.i18n_suggestions$$, '42501', null, 'signed-in users cannot read suggestions directly');
select throws_ok($$select count(*) from public.i18n_votes$$, '42501', null, 'nor votes');
select throws_ok($$insert into public.i18n_suggestions (language_code, string_key, text, origin) values ('xx', 't.b', 'x', 'user')$$, '42501', null, 'nor write suggestions');
select throws_ok($$insert into public.i18n_pins (language_code, string_key, suggestion_id) values ('xx', 't.b', gen_random_uuid())$$, '42501', null, 'nor write pins');
reset role;
set local role anon;
select throws_ok($$select * from public.i18n_workspace('xx')$$, '42501', null, 'signed-out visitors cannot call the workspace');
select throws_ok($$select * from public.i18n_languages_list()$$, '42501', null, 'nor the language list');
select is((select count(*)::int from public.i18n_display('xx')), 1, 'signed-out visitors can read the shown text (machine draft only)');
reset role;

-- Starting point: the machine draft is shown
select pg_temp.as_user(1);
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'machine {name}', 'machine draft is shown first');
select is((select kind from public.i18n_workspace('xx') where string_key = 't.a'), 'mac', 'and marked as machine');
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.b'), null, 'a string with nothing shows nothing');

-- Adding a suggestion counts as a vote and wins over the machine draft
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids select 's1', public.i18n_add_suggestion('xx', 't.a', 'សួស្តី {name}');
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'សួស្តី {name}', 'a voted suggestion beats the machine draft');
select is((select kind from public.i18n_workspace('xx') where string_key = 't.a'), 'top', 'and is marked top voted');
select is(public.i18n_add_suggestion('xx', 't.a', '  សួស្តី   {name} '), (select id from ids where name = 's1'), 'the same text again returns the existing suggestion');
select throws_ok($$select public.i18n_add_suggestion('xx', 't.a', 'សួស្តី')$$, 'P0001', 'tokens_mismatch', 'a missing {token} is rejected');
select throws_ok($$select public.i18n_add_suggestion('xx', 't.a', 'សួស្តី {name} {extra}')$$, 'P0001', 'tokens_mismatch', 'an extra {token} is rejected');
select throws_ok($$select public.i18n_add_suggestion('en', 't.a', 'x {name}')$$, 'P0002', 'language_not_found', 'the source language takes no suggestions');
select throws_ok($$select public.i18n_add_suggestion('xx', 't.zzz', 'x')$$, 'P0002', 'not_found', 'unknown strings are rejected');
reset role;

-- A second person adds another suggestion, then votes for the first: one vote per person per string
select pg_temp.as_user(2);
insert into ids select 's2', public.i18n_add_suggestion('xx', 't.a', 'ជំរាបសួរ {name}');
reset role;
select is((select count(*)::int from public.i18n_votes where language_code = 'xx' and string_key = 't.a'), 2, 'two people, two votes');
select pg_temp.as_user(2);
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'សួស្តី {name}', 'a tie goes to the older suggestion');
select lives_ok($$select public.i18n_vote((select id from ids where name = 's1'), true)$$, 'voting for another suggestion works');
reset role;
select is((select count(*)::int from public.i18n_votes where user_id = 'd1000000-0000-0000-0000-000000000002' and string_key = 't.a'), 1, 'it moved the vote instead of adding one');
select is((select count(*)::int from public.i18n_votes where suggestion_id = (select id from ids where name = 's2')), 0, 'the other suggestion lost that vote');
select pg_temp.as_user(2);
select lives_ok($$select public.i18n_vote((select id from ids where name = 's1'), false)$$, 'a vote can be withdrawn');
select lives_ok($$select public.i18n_vote((select id from ids where name = 's1'), true)$$, 'and given again');

-- Names and counts
select is((select author_name from public.i18n_string_detail('xx', 't.a') where id = (select id from ids where name = 's1')), 'Dara', 'only the first word of the name is shown');
select ok((select bool_and(votes is null) from public.i18n_string_detail('xx', 't.a')), 'vote counts are hidden from translators');
select is((select count(*)::int from public.i18n_string_detail('xx', 't.a') where i_voted), 1, 'a translator sees which one they voted for');
select throws_ok($$select * from public.i18n_review_queue('xx')$$, '42501', null, 'translators cannot open the review queue');
select throws_ok($$select public.i18n_pin('xx', 't.a', (select id from ids where name = 's2'))$$, '42501', null, 'only reviewers can pin');
select throws_ok($$select public.i18n_unpin('xx', 't.a')$$, '42501', null, 'only reviewers can unpin');
reset role;

-- Reviewer: sees counts, pins, re-pins, unpins
select pg_temp.as_user(3);
select is((select votes from public.i18n_string_detail('xx', 't.a') where id = (select id from ids where name = 's1')), 2, 'a reviewer sees vote counts');
select lives_ok($$select public.i18n_pin('xx', 't.a', (select id from ids where name = 's2'))$$, 'a reviewer can pin a suggestion');
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'ជំរាបសួរ {name}', 'the pinned text is shown even with fewer votes');
select is((select kind from public.i18n_workspace('xx') where string_key = 't.a'), 'pin', 'and marked pinned');
select ok((select differs from public.i18n_review_queue('xx') where string_key = 't.a'), 'the queue flags a pin that differs from the votes');
select lives_ok($$select public.i18n_pin('xx', 't.a', (select id from ids where name = 's1'))$$, 'a pin can be moved');
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'សួស្តី {name}', 'to another suggestion');
select throws_ok($$select public.i18n_pin('xx', 't.b', (select id from ids where name = 's1'))$$, 'P0002', 'not_found', 'a pin must point at a suggestion of the same string');
select lives_ok($$select public.i18n_pin('xx', 't.a', (select id from ids where name = 's2'))$$, 'pin again');
select lives_ok($$select public.i18n_unpin('xx', 't.a')$$, 'and unpin');
select is((select kind from public.i18n_workspace('xx') where string_key = 't.a'), 'top', 'after unpinning the votes decide again');
select is((select shown_text from public.i18n_workspace('xx') where string_key = 't.a'), 'សួស្តី {name}', 'with the top voted text');
reset role;

-- At most three suggestions per person per string
select pg_temp.as_user(1);
select lives_ok($$select public.i18n_add_suggestion('xx', 't.b', 'a')$$, 'first');
select lives_ok($$select public.i18n_add_suggestion('xx', 't.b', 'b')$$, 'second');
select lives_ok($$select public.i18n_add_suggestion('xx', 't.b', 'c')$$, 'third');
select throws_ok($$select public.i18n_add_suggestion('xx', 't.b', 'd')$$, 'P0001', 'suggestion_limit', 'fourth is refused');
reset role;

-- New languages and machine drafts
select pg_temp.as_user(1);
select is(public.i18n_create_language('yy', 'Yy language', null), 'yy', 'anyone can start a language');
select throws_ok($$select public.i18n_create_language('yy', 'Again', null)$$, 'P0001', 'language_exists', 'a language code is unique');
select throws_ok($$select public.i18n_create_language('Bad Code', 'x', null)$$, 'P0001', 'invalid_language', 'a bad code is refused');
select ok((select count(*) from public.i18n_begin_machine('yy')) >= 2, 'beginning machine translation returns the strings to translate');
select throws_ok($$select * from public.i18n_begin_machine('yy')$$, 'P0001', 'machine_busy', 'a second run is refused while one is pending');
reset role;
select pg_temp.as_user(2);
select throws_ok($$select public.i18n_add_machine_drafts('yy', '{"t.a": "x {name}"}'::jsonb)$$, '42501', null, 'someone else cannot store drafts for that run');
reset role;
select pg_temp.as_user(1);
select is(public.i18n_add_machine_drafts('yy', '{"t.a": "x {name}", "t.b": "y", "nope": "z", "t.zz": "q"}'::jsonb), 2, 'drafts for known strings are stored, unknown keys ignored');
select throws_ok($$select public.i18n_add_machine_drafts('yy', '{"t.b": "again"}'::jsonb)$$, '42501', null, 'and nothing more can be stored once the run is done');
select is((select machine_status from public.i18n_languages_list() where code = 'yy'), 'done', 'the language is marked done');
select is((select kind from public.i18n_workspace('yy') where string_key = 't.b'), 'mac', 'drafts show as machine drafts');
reset role;

select string_agg(t, ' | ') as result from finish() t;
rollback;
