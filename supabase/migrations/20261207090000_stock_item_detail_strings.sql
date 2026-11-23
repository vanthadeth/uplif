-- Strings for the Stock app: item stock detail. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.id.back', 'Back to stock levels', 4000),
  ('sk.id.where', 'Where it is', 4001),
  ('sk.id.none', 'No stock of this item right now.', 4002),
  ('sk.id.recent', 'Latest movements', 4003)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.id.back', 'ត្រឡប់ទៅកម្រិតស្តុក'),
  ('sk.id.where', 'ទីតាំងរបស់វា'),
  ('sk.id.none', 'បច្ចុប្បន្នមិនមានស្តុកទំនិញនេះទេ។'),
  ('sk.id.recent', 'ចលនាចុងក្រោយ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
