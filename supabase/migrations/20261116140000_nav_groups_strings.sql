-- Strings for the regrouped console side menu. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('shell.group.time', 'Time and leave', 1912),
  ('shell.group.growth', 'Growth and learning', 1913),
  ('shell.group.admin', 'Administration', 1914)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('shell.group.time', 'ពេលវេលា និងច្បាប់ឈប់សម្រាក'),
  ('shell.group.growth', 'ការអភិវឌ្ឍ និងការរៀន'),
  ('shell.group.admin', 'ការគ្រប់គ្រង')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
