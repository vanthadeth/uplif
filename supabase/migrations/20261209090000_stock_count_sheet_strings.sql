-- Strings for the Stock app: count a location. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.mv.tabCount', 'Count', 4200),
  ('sk.ct.title', 'Count a location', 4201),
  ('sk.ct.hint', 'Type what you counted for each item you checked. Only items that differ from the system quantity are saved, as one stock count adjustment.', 4202),
  ('sk.ct.showAll', 'Include items with no stock here', 4203),
  ('sk.ct.empty', 'No items to count here yet.', 4204),
  ('sk.ct.system', 'System: {qty} {unit}', 4205),
  ('sk.ct.counted', 'Counted', 4206),
  ('sk.ct.changes', 'Save {n} changes', 4207),
  ('sk.ct.noChanges', 'Type a counted quantity that differs from the system quantity for at least one item.', 4208),
  ('sk.ct.done', '{n} changes saved.', 4209),
  ('sk.ct.more', '{n} more are still on the sheet. Save again to continue.', 4210)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.mv.tabCount', 'រាប់ស្តុក'),
  ('sk.ct.title', 'រាប់ស្តុកក្នុងទីតាំង'),
  ('sk.ct.hint', 'វាយចំនួនដែលអ្នករាប់សម្រាប់ទំនិញនីមួយៗដែលអ្នកបានពិនិត្យ។ មានតែទំនិញដែលខុសពីចំនួនក្នុងប្រព័ន្ធប៉ុណ្ណោះដែលត្រូវបានរក្សាទុក ជាការកែតម្រូវការរាប់ស្តុកមួយ។'),
  ('sk.ct.showAll', 'រួមទាំងទំនិញដែលគ្មានស្តុកនៅទីនេះ'),
  ('sk.ct.empty', 'មិនទាន់មានទំនិញត្រូវរាប់នៅទីនេះទេ។'),
  ('sk.ct.system', 'ប្រព័ន្ធ៖ {qty} {unit}'),
  ('sk.ct.counted', 'ចំនួនដែលរាប់បាន'),
  ('sk.ct.changes', 'រក្សាទុកការផ្លាស់ប្តូរ {n}'),
  ('sk.ct.noChanges', 'សូមវាយចំនួនដែលរាប់ដែលខុសពីចំនួនក្នុងប្រព័ន្ធយ៉ាងហោចណាស់សម្រាប់ទំនិញមួយ។'),
  ('sk.ct.done', 'បានរក្សាទុកការផ្លាស់ប្តូរ {n}។'),
  ('sk.ct.more', 'នៅសល់ {n} ទៀតនៅលើតារាង។ សូមរក្សាទុកម្តងទៀតដើម្បីបន្ត។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
