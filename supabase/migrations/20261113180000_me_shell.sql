-- UPLIF Me shell: the signed-in employee's own work details for the top bar and Profile.
-- Only the caller's own record is returned; nothing here takes an employee id.
create function public.my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  e public.employees%rowtype;
  co public.companies%rowtype;
begin
  if not (select app.is_active_member()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if eid is null then return jsonb_build_object('linked', false); end if;
  select * into e from public.employees where id = eid and company_id = cid;
  select * into co from public.companies where id = cid;
  return jsonb_build_object(
    'linked', true,
    'company', jsonb_build_object('name', co.name, 'name_local', co.name_local),
    'position', (select jsonb_build_object('name', p.name, 'name_local', p.name_local) from public.positions p where p.id = e.position_id and p.company_id = cid),
    'department', (select jsonb_build_object('name', d.name, 'name_local', d.name_local) from public.departments d where d.id = e.department_id and d.company_id = cid),
    'reports_to', (select jsonb_build_object('name', r.name, 'name_local', r.name_local) from public.employees r where r.id = e.reports_to_id and r.company_id = cid),
    'employment_date', e.employment_date);
end $$;

revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Khmer entries are machine drafts for the Khmer reviewer at /i18n; a reviewer's pinned or voted text is never overwritten.
insert into public.i18n_strings (key, source_text, position) values
  ('st.tab.profile', 'Profile', 1455),
  ('st.tab.menu', 'Menu', 1456),
  ('st.bar.notifications', 'Notifications', 1457),
  ('st.bar.account', 'Your account', 1458),
  ('st.bar.role', 'Employee', 1459),
  ('st.menu.title', 'Menu', 1460),
  ('st.menu.preferences', 'Preferences', 1461),
  ('st.menu.privacy', 'Privacy and consents', 1462),
  ('st.menu.help', 'Help', 1463),
  ('st.menu.version', 'About UPLIF Me', 1464),
  ('st.notif.title', 'Notifications', 1465),
  ('st.notif.empty.title', 'You are all caught up', 1466),
  ('st.notif.empty.body', 'Reminders and updates from your manager will show here.', 1467),
  ('st.profile.title', 'Profile', 1468),
  ('st.profile.tabs', 'Profile sections', 1469),
  ('st.profile.work', 'Work', 1470),
  ('st.profile.accounts', 'Linked accounts', 1471),
  ('st.profile.position', 'Position', 1472),
  ('st.profile.branch', 'Branch', 1473),
  ('st.profile.department', 'Department', 1474),
  ('st.profile.reportsTo', 'Reports to', 1475),
  ('st.profile.since', 'Employed since', 1476),
  ('st.profile.none', 'Not set', 1477),
  ('st.profile.note', 'Your manager keeps these details up to date. Ask them if something is wrong.', 1478),
  ('st.profile.error', 'Your profile could not be loaded. Check your connection and try again.', 1479),
  ('st.account.title', 'Sign-in methods', 1480),
  ('st.account.intro', 'Link your accounts so you can sign in to the same UPLIF account in any of these ways.', 1481),
  ('st.account.google', 'Google', 1482),
  ('st.account.telegram', 'Telegram', 1483),
  ('st.account.phone', 'Phone', 1484),
  ('st.account.connected', 'Connected', 1485),
  ('st.account.notConnected', 'Not connected', 1486),
  ('st.account.link', 'Connect', 1487),
  ('st.account.unlink', 'Disconnect', 1488),
  ('st.account.phonePaused', 'Phone sign-in is paused for now.', 1489),
  ('st.account.lastMethod', 'This is your only way to sign in.', 1490),
  ('st.account.lastMethodHint', 'Connect another method before you disconnect this one, so you cannot lock yourself out.', 1491),
  ('st.account.unlinkTitle.google', 'Disconnect Google?', 1492),
  ('st.account.unlinkTitle.telegram', 'Disconnect Telegram?', 1493),
  ('st.account.unlinkBody', 'You will no longer be able to sign in with it. You can connect it again later.', 1494),
  ('st.account.linked.telegram', 'Telegram is connected.', 1495),
  ('st.account.unlinked.google', 'Google is disconnected.', 1496),
  ('st.account.unlinked.telegram', 'Telegram is disconnected.', 1497),
  ('st.account.error.generic', 'Could not do that. Try again.', 1498),
  ('st.account.error.telegramTaken', 'That Telegram account is already used by another UPLIF account.', 1499),
  ('st.account.loadFailed', 'Could not load your sign-in methods', 1500),
  ('st.account.loadFailedBody', 'Reload the page and try again.', 1501),
  ('st.account.close', 'Close', 1502)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.tab.profile', 'ប្រវត្តិរូប'),
  ('st.tab.menu', 'ម៉ឺនុយ'),
  ('st.bar.notifications', 'ការជូនដំណឹង'),
  ('st.bar.account', 'គណនីរបស់អ្នក'),
  ('st.bar.role', 'បុគ្គលិក'),
  ('st.menu.title', 'ម៉ឺនុយ'),
  ('st.menu.preferences', 'ចំណូលចិត្ត'),
  ('st.menu.privacy', 'ឯកជនភាព និងការយល់ព្រម'),
  ('st.menu.help', 'ជំនួយ'),
  ('st.menu.version', 'អំពី UPLIF Me'),
  ('st.notif.title', 'ការជូនដំណឹង'),
  ('st.notif.empty.title', 'អ្នកបានមើលអស់ហើយ'),
  ('st.notif.empty.body', 'ការរំលឹក និងដំណឹងពីអ្នកគ្រប់គ្រងរបស់អ្នកនឹងបង្ហាញនៅទីនេះ។'),
  ('st.profile.title', 'ប្រវត្តិរូប'),
  ('st.profile.tabs', 'ផ្នែកនៃប្រវត្តិរូប'),
  ('st.profile.work', 'ការងារ'),
  ('st.profile.accounts', 'គណនីដែលបានភ្ជាប់'),
  ('st.profile.position', 'មុខតំណែង'),
  ('st.profile.branch', 'សាខា'),
  ('st.profile.department', 'នាយកដ្ឋាន'),
  ('st.profile.reportsTo', 'រាយការណ៍ទៅ'),
  ('st.profile.since', 'បានចូលធ្វើការតាំងពី'),
  ('st.profile.none', 'មិនទាន់កំណត់'),
  ('st.profile.note', 'អ្នកគ្រប់គ្រងរបស់អ្នកជាអ្នកធ្វើបច្ចុប្បន្នភាពព័ត៌មានទាំងនេះ។ សូមសួរពួកគេប្រសិនបើមានអ្វីខុស។'),
  ('st.profile.error', 'មិនអាចផ្ទុកប្រវត្តិរូបរបស់អ្នកបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។'),
  ('st.account.title', 'វិធីចូលគណនី'),
  ('st.account.intro', 'ភ្ជាប់គណនីរបស់អ្នក ដើម្បីអាចចូលគណនី UPLIF តែមួយតាមវិធីណាមួយក្នុងចំណោមទាំងនេះ។'),
  ('st.account.google', 'Google'),
  ('st.account.telegram', 'Telegram'),
  ('st.account.phone', 'ទូរស័ព្ទ'),
  ('st.account.connected', 'បានភ្ជាប់'),
  ('st.account.notConnected', 'មិនទាន់ភ្ជាប់'),
  ('st.account.link', 'ភ្ជាប់'),
  ('st.account.unlink', 'ផ្ដាច់'),
  ('st.account.phonePaused', 'ការចូលតាមទូរស័ព្ទត្រូវបានផ្អាកជាបណ្ដោះអាសន្ន។'),
  ('st.account.lastMethod', 'នេះជាវិធីតែមួយគត់ដែលអ្នកអាចចូលបាន។'),
  ('st.account.lastMethodHint', 'សូមភ្ជាប់វិធីផ្សេងទៀតជាមុនសិន មុនពេលផ្ដាច់វិធីនេះ ដើម្បីកុំឱ្យអ្នកចូលមិនបាន។'),
  ('st.account.unlinkTitle.google', 'ផ្ដាច់ Google ឬ?'),
  ('st.account.unlinkTitle.telegram', 'ផ្ដាច់ Telegram ឬ?'),
  ('st.account.unlinkBody', 'អ្នកនឹងមិនអាចចូលតាមវិធីនេះទៀតទេ។ អ្នកអាចភ្ជាប់វាម្ដងទៀតនៅពេលក្រោយ។'),
  ('st.account.linked.telegram', 'បានភ្ជាប់ Telegram។'),
  ('st.account.unlinked.google', 'បានផ្ដាច់ Google។'),
  ('st.account.unlinked.telegram', 'បានផ្ដាច់ Telegram។'),
  ('st.account.error.generic', 'មិនអាចធ្វើបានទេ។ សូមព្យាយាមម្តងទៀត។'),
  ('st.account.error.telegramTaken', 'គណនី Telegram នោះត្រូវបានប្រើដោយគណនី UPLIF ផ្សេងរួចហើយ។'),
  ('st.account.loadFailed', 'មិនអាចផ្ទុកវិធីចូលគណនីរបស់អ្នកបានទេ'),
  ('st.account.loadFailedBody', 'សូមផ្ទុកទំព័រឡើងវិញ ហើយព្យាយាមម្តងទៀត។'),
  ('st.account.close', 'បិទ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
