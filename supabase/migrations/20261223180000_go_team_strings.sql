-- Strings for the UPLIF Go team feed. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.team.title', 'Team activity', 2700),
  ('go.team.visits', 'Visits today', 2701),
  ('go.team.calls', 'Calls', 2702),
  ('go.team.overdue', 'Overdue', 2703),
  ('go.team.all', 'All', 2704),
  ('go.team.visitsOnly', 'Visits', 2705),
  ('go.team.callsOnly', 'Calls', 2706),
  ('go.team.empty', 'Nothing logged yet today.', 2707),
  ('go.team.noAccess', 'Team activity is for managers.', 2708),
  ('go.team.outside', 'Outside range', 2709),
  ('go.team.loadError', 'Could not load team activity', 2710),
  ('go.team.lateFor', 'Overdue {n} days', 2711),
  ('go.team.open', 'Open conversation', 2712),
  ('go.menu.team', 'Team activity', 2713)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.team.title', 'សកម្មភាពក្រុម'),
  ('go.team.visits', 'ការជួបថ្ងៃនេះ'),
  ('go.team.calls', 'ការហៅទូរសព្ទ'),
  ('go.team.overdue', 'យឺត'),
  ('go.team.all', 'ទាំងអស់'),
  ('go.team.visitsOnly', 'ការជួប'),
  ('go.team.callsOnly', 'ការហៅទូរសព្ទ'),
  ('go.team.empty', 'ថ្ងៃនេះមិនទាន់មានកំណត់ត្រាទេ។'),
  ('go.team.noAccess', 'សកម្មភាពក្រុមសម្រាប់អ្នកគ្រប់គ្រងប៉ុណ្ណោះ។'),
  ('go.team.outside', 'ក្រៅចម្ងាយ'),
  ('go.team.loadError', 'មិនអាចផ្ទុកសកម្មភាពក្រុមបានទេ'),
  ('go.team.lateFor', 'យឺត {n} ថ្ងៃ'),
  ('go.team.open', 'បើកការសន្ទនា'),
  ('go.menu.team', 'សកម្មភាពក្រុម')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
