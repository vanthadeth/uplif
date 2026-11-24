-- Strings for the UPLIF Go Today screen. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.today.hello', 'Hello, {name}', 2400),
  ('go.today.clock', 'Clock', 2401),
  ('go.today.in', 'Clocked in {time}', 2402),
  ('go.today.out', 'Clocked out {time}', 2403),
  ('go.today.notYet', 'Not clocked in yet', 2404),
  ('go.today.worked', 'Worked today', 2405),
  ('go.today.clockIn', 'Clock in', 2406),
  ('go.today.clockOut', 'Clock out', 2407),
  ('go.today.clockNote', 'Clocking opens UPLIF Me for now. It moves here soon.', 2408),
  ('go.today.attention', 'Needs your attention', 2409),
  ('go.today.attention.none', 'Nothing waiting for you.', 2410),
  ('go.today.replied', 'New reply: {name}', 2411),
  ('go.today.open', 'Open', 2412)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.today.hello', 'សួស្តី {name}'),
  ('go.today.clock', 'ម៉ោងធ្វើការ'),
  ('go.today.in', 'បានចូលម៉ោង {time}'),
  ('go.today.out', 'បានចេញម៉ោង {time}'),
  ('go.today.notYet', 'មិនទាន់បានចូលធ្វើការ'),
  ('go.today.worked', 'បានធ្វើការថ្ងៃនេះ'),
  ('go.today.clockIn', 'ចូលធ្វើការ'),
  ('go.today.clockOut', 'ចេញពីការងារ'),
  ('go.today.clockNote', 'ពេលនេះការចុះម៉ោងបើក UPLIF Me។ ឆាប់ៗនេះនឹងមកទីនេះ។'),
  ('go.today.attention', 'ត្រូវការការយកចិត្តទុកដាក់'),
  ('go.today.attention.none', 'គ្មានអ្វីរង់ចាំអ្នកទេ។'),
  ('go.today.replied', 'ការឆ្លើយតបថ្មី៖ {name}'),
  ('go.today.open', 'បើក')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
