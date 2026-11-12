-- User profiles: company record, personal profile privacy, sharing, checked admin read and the picture bucket.
-- One transaction, rolled back. Needs migration 14 applied (or run inline).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
create function pg_temp.as_user(p_uid uuid, p_company text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('company_id', (select id from public.companies where name = p_company),
    'membership_id', (select m.id from public.memberships m join public.companies c on c.id = m.company_id where c.name = p_company and m.user_id = p_uid)))::text, true)
$f$;
create temp table tk(t text);
grant all on tk to authenticated;

insert into auth.users (id, aud, role, email) values
  ('ffffffff-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'up-1@test.local'),
  ('ffffffff-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'up-2@test.local'),
  ('ffffffff-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'up-3@test.local');
insert into public.profiles (user_id, full_name) values ('ffffffff-0000-0000-0000-0000000000a1', 'Owner One'), ('ffffffff-0000-0000-0000-0000000000a2', 'Owner Two'), ('ffffffff-0000-0000-0000-0000000000a3', 'Staff Three');

select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Prof One', null, 'KH', 'KHR', 'Main');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-0000-0000-0000000000a2', 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
set local role authenticated;
select public.create_company('Prof Two', null, 'KH', 'KHR', 'Main');
reset role;
-- Staff member of company one (no permission to view team members), set up as admin tooling would.
insert into public.memberships (company_id, user_id, display_name)
  select id, 'ffffffff-0000-0000-0000-0000000000a3', 'Staff Three' from public.companies where name = 'Prof One';
insert into public.membership_roles (company_id, membership_id, role_id)
  select m.company_id, m.id, r.id from public.memberships m join public.roles r on r.company_id = m.company_id and r.name = 'Staff'
  where m.user_id = 'ffffffff-0000-0000-0000-0000000000a3';

-- Owner one: company record
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a1', 'Prof One');
set local role authenticated;
select lives_ok($$update public.memberships set employee_id = 'E-001', job_title = 'Founder', employment_date = '2024-01-02' where user_id = 'ffffffff-0000-0000-0000-0000000000a1'$$, 'owner sets own company record');
select lives_ok($$update public.memberships set employee_id = 'E-002' where user_id = 'ffffffff-0000-0000-0000-0000000000a3'$$, 'owner sets staff employee id');
select throws_ok($$update public.memberships set employee_id = 'e-002' where user_id = 'ffffffff-0000-0000-0000-0000000000a1'$$, '23505', null, 'employee id is unique per company, ignoring case');
-- Owner one: own personal profile and sharing
select lives_ok($$update public.profiles set gender = 'M', date_of_birth = '1990-05-20', address_line1 = 'Street 51', address_line2 = 'Phnom Penh', emergency_name = 'Sokha', emergency_phone = '+855 12 555 222' where user_id = 'ffffffff-0000-0000-0000-0000000000a1'$$, 'person edits own profile');
select lives_ok($$insert into public.profile_phones (user_id, label, number) values ('ffffffff-0000-0000-0000-0000000000a1', 'mobile', '+855 12 000 111'), ('ffffffff-0000-0000-0000-0000000000a1', 'work', '023 123 456'), ('ffffffff-0000-0000-0000-0000000000a1', 'home', '012 345 678')$$, 'three phone numbers');
select throws_ok($$insert into public.profile_phones (user_id, label, number) values ('ffffffff-0000-0000-0000-0000000000a1', 'home', '099 111 222')$$, '23514', 'at most three phone numbers', 'a fourth number is refused');
select throws_ok($$insert into public.profile_phones (user_id, label, number) values ('ffffffff-0000-0000-0000-0000000000a1', 'mobile', 'abc')$$, '23514', null, 'a bad number is refused');
select throws_ok($$update public.profiles set date_of_birth = current_date + 1 where user_id = 'ffffffff-0000-0000-0000-0000000000a1'$$, '23514', null, 'birth date cannot be in the future');
reset role;

-- Staff three: no permission to read another profile; cannot read or change anyone else's personal data
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a3', 'Prof One');
set local role authenticated;
select throws_ok($$select * from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a1'))$$, '42501', 'not allowed', 'staff cannot read another profile');
select is((select count(*)::int from public.profiles), 1, 'staff sees only their own profile row');
select is((select count(*)::int from public.profile_phones), 0, 'staff sees none of the owner phone numbers');
select is((select count(*)::int from public.membership_sharing), 0, 'staff sees no sharing rows');
select is((select count(*)::int from public.invitations), 0, 'staff sees no invitations');
select lives_ok($$update public.memberships set employee_id = 'E-999' where user_id = 'ffffffff-0000-0000-0000-0000000000a3'$$, 'update runs but changes nothing for staff');
reset role;
select is((select employee_id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'), 'E-002', 'staff cannot change their own employee id');

-- Staff three fills in a profile and a picture, shares nothing at first
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a3', 'Prof One');
set local role authenticated;
select lives_ok($$update public.profiles set gender = 'F', address_line1 = 'Secret street', emergency_name = 'Mum', emergency_phone = '+855 11 222 333', picture_path = 'ffffffff-0000-0000-0000-0000000000a3/me.jpg' where user_id = 'ffffffff-0000-0000-0000-0000000000a3'$$, 'staff edits own profile');
select lives_ok($$insert into public.profile_phones (user_id, label, number) values ('ffffffff-0000-0000-0000-0000000000a3', 'mobile', '+855 77 123 456')$$, 'staff adds a number');
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('profile-pictures', 'ffffffff-0000-0000-0000-0000000000a3/me.jpg', 'ffffffff-0000-0000-0000-0000000000a3')$$, 'staff uploads to their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('profile-pictures', 'ffffffff-0000-0000-0000-0000000000a1/evil.jpg', 'ffffffff-0000-0000-0000-0000000000a3')$$, '42501', null, 'staff cannot upload into someone else''s folder');
select throws_ok($$insert into public.membership_sharing (company_id, membership_id, share_phones) values ((select company_id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a1'), (select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a1'), true)$$, '42501', null, 'staff cannot set sharing for someone else');
reset role;

-- Owner one reads staff three: picture and name only
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a1', 'Prof One');
set local role authenticated;
select is((select full_name from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), 'Staff Three', 'admin sees the name');
select is((select picture_path from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), 'ffffffff-0000-0000-0000-0000000000a3/me.jpg', 'admin sees the picture path');
select is((select phones from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'phones stay private');
select is((select address_line1 from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'address stays private');
select is((select gender from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'gender stays private');
select is((select emergency_phone from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'emergency contact stays private');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-pictures' and name like 'ffffffff-0000-0000-0000-0000000000a3/%'), 1, 'a colleague can see the picture object');
select lives_ok($$update public.profiles set full_name = 'Hacked' where user_id = 'ffffffff-0000-0000-0000-0000000000a3'$$, 'admin update of a personal profile runs but matches nothing');
reset role;
select is((select full_name from public.profiles where user_id = 'ffffffff-0000-0000-0000-0000000000a3'), 'Staff Three', 'admin cannot edit the personal profile');

-- Staff three shares phones and gender only
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a3', 'Prof One');
set local role authenticated;
select lives_ok($$insert into public.membership_sharing (company_id, membership_id, share_phones, share_gender) values ((select company_id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'), (select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'), true, true)$$, 'staff shares phones and gender');
reset role;
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a1', 'Prof One');
set local role authenticated;
select is((select jsonb_array_length(phones) from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), 1, 'shared phones now visible');
select is((select gender from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), 'F', 'shared gender now visible');
select is((select address_line1 from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'address is still private');
select is((select emergency_name from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))), null, 'emergency is still private');
select is((select count(*)::int from public.audit_log where action = 'membership_sharing.insert'), 1, 'sharing change is in the company audit log');
select is((select count(*)::int from public.audit_log where action like 'profiles.%' or action like 'profile_phones.%'), 0, 'personal profile edits are not in the audit log');
reset role;

-- Owner two (other company): sees nothing, cannot read through the function
select pg_temp.as_user('ffffffff-0000-0000-0000-0000000000a2', 'Prof Two');
set local role authenticated;
select throws_ok($$select * from public.get_member_profile((select id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'))$$, 'P0002', 'not found', 'other company cannot read the profile');
select is((select count(*)::int from public.profiles where user_id <> 'ffffffff-0000-0000-0000-0000000000a2'), 0, 'other company sees no foreign profile rows');
select is((select count(*)::int from public.profile_phones), 0, 'other company sees no phone numbers');
select is((select count(*)::int from public.membership_sharing), 0, 'other company sees no sharing rows');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-pictures'), 0, 'other company cannot see company one pictures');
select lives_ok($$update public.memberships set employee_id = 'X-1' where user_id = 'ffffffff-0000-0000-0000-0000000000a3'$$, 'other company update runs but matches nothing');
reset role;
select is((select employee_id from public.memberships where user_id = 'ffffffff-0000-0000-0000-0000000000a3'), 'E-002', 'company record untouched by other company');

select * from finish();
rollback;
