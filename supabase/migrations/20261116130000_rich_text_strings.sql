-- Strings for the rich text editor (policies, code of conduct). Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('rte.bold', 'Bold', 1903),
  ('rte.italic', 'Italic', 1904),
  ('rte.underline', 'Underline', 1905),
  ('rte.heading', 'Heading', 1906),
  ('rte.bullets', 'Bulleted list', 1907),
  ('rte.numbers', 'Numbered list', 1908),
  ('rte.link', 'Link', 1909),
  ('rte.linkUrl', 'Link address', 1910),
  ('rte.linkApply', 'Add link', 1911)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('rte.bold', 'ដិត'),
  ('rte.italic', 'ទ្រេត'),
  ('rte.underline', 'គូសបន្ទាត់ក្រោម'),
  ('rte.heading', 'ចំណងជើង'),
  ('rte.bullets', 'បញ្ជីមានចំណុច'),
  ('rte.numbers', 'បញ្ជីមានលេខ'),
  ('rte.link', 'តំណ'),
  ('rte.linkUrl', 'អាសយដ្ឋានតំណ'),
  ('rte.linkApply', 'បន្ថែមតំណ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
