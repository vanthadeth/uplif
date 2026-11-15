-- Strings for the Stock app: movement history. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.hi.title', 'History', 3900),
  ('sk.hi.subtitle', 'Every change to stock, newest first.', 3901),
  ('sk.hi.back', 'Back to Move', 3902),
  ('sk.hi.link', 'See all history', 3903),
  ('sk.hi.kind', 'Type', 3904),
  ('sk.hi.allKinds', 'All types', 3905),
  ('sk.hi.location', 'Location', 3906),
  ('sk.hi.allLocations', 'All locations', 3907),
  ('sk.hi.search', 'Search item or reference', 3908),
  ('sk.hi.noMatch', 'No movements match.', 3909),
  ('sk.hi.empty', 'No movements yet', 3910),
  ('sk.hi.emptyBody', 'Received, adjusted and transferred stock will be listed here.', 3911),
  ('sk.hi.more', 'Show more', 3912),
  ('sk.hi.loadError', 'History could not be loaded.', 3913)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.hi.title', 'ប្រវត្តិ'),
  ('sk.hi.subtitle', 'រាល់ការផ្លាស់ប្តូរស្តុក ថ្មីបំផុតមុន។'),
  ('sk.hi.back', 'ត្រឡប់ទៅផ្លាស់ទីស្តុក'),
  ('sk.hi.link', 'មើលប្រវត្តិទាំងអស់'),
  ('sk.hi.kind', 'ប្រភេទ'),
  ('sk.hi.allKinds', 'គ្រប់ប្រភេទ'),
  ('sk.hi.location', 'ទីតាំង'),
  ('sk.hi.allLocations', 'គ្រប់ទីតាំង'),
  ('sk.hi.search', 'ស្វែងរកទំនិញ ឬលេខយោង'),
  ('sk.hi.noMatch', 'គ្មានចលនាត្រូវគ្នាទេ។'),
  ('sk.hi.empty', 'មិនទាន់មានចលនាទេ'),
  ('sk.hi.emptyBody', 'ស្តុកដែលបានទទួល កែតម្រូវ និងផ្ទេរ នឹងបង្ហាញនៅទីនេះ។'),
  ('sk.hi.more', 'បង្ហាញបន្ថែម'),
  ('sk.hi.loadError', 'មិនអាចផ្ទុកប្រវត្តិបានទេ។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
