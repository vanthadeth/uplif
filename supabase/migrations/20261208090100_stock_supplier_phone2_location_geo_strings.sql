-- Strings for the Stock app: supplier second phone, location map position. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.sup.phone2', 'Second phone number', 4100),
  ('sk.loc.geo', 'Map position', 4101),
  ('sk.loc.geoHint', 'Optional. Latitude and longitude of this location, for example 11.556374 and 104.928207.', 4102),
  ('sk.loc.lat', 'Latitude', 4103),
  ('sk.loc.lng', 'Longitude', 4104),
  ('sk.loc.useMine', 'Use my current position', 4105),
  ('sk.loc.geoBoth', 'Fill in both latitude and longitude, or leave both empty.', 4106),
  ('sk.loc.geoInvalid', 'Latitude must be between -90 and 90, and longitude between -180 and 180.', 4107),
  ('sk.loc.geoUnavailable', 'Could not get your position. Allow location access, or type the numbers.', 4108),
  ('sk.loc.map', 'Open {name} on the map', 4109)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.sup.phone2', 'លេខទូរសព្ទទីពីរ'),
  ('sk.loc.geo', 'ទីតាំងលើផែនទី'),
  ('sk.loc.geoHint', 'ជាជម្រើស។ រយៈទទឹង និងរយៈបណ្តោយរបស់ទីតាំងនេះ ឧទាហរណ៍ 11.556374 និង 104.928207។'),
  ('sk.loc.lat', 'រយៈទទឹង'),
  ('sk.loc.lng', 'រយៈបណ្តោយ'),
  ('sk.loc.useMine', 'ប្រើទីតាំងបច្ចុប្បន្នរបស់ខ្ញុំ'),
  ('sk.loc.geoBoth', 'សូមបំពេញទាំងរយៈទទឹង និងរយៈបណ្តោយ ឬទុកទទេទាំងពីរ។'),
  ('sk.loc.geoInvalid', 'រយៈទទឹងត្រូវនៅចន្លោះ -90 ដល់ 90 ហើយរយៈបណ្តោយនៅចន្លោះ -180 ដល់ 180។'),
  ('sk.loc.geoUnavailable', 'មិនអាចទទួលបានទីតាំងរបស់អ្នកទេ។ សូមអនុញ្ញាតការចូលប្រើទីតាំង ឬវាយលេខ។'),
  ('sk.loc.map', 'បើក {name} លើផែនទី')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
