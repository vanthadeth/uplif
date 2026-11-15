-- String for the Stock app: CSV export button. Khmer entry is a machine draft for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.ex.button', 'Export CSV', 4400)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.ex.button', 'នាំចេញ CSV')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
