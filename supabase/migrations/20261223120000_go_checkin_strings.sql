-- Strings for UPLIF Go check-in. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.today.checkIn', 'Check in at a customer', 2420),
  ('go.today.atVisit', 'In a visit: {name}', 2421),
  ('go.checkin.title', 'Check in at a customer', 2422),
  ('go.checkin.locating', 'Finding your location', 2423),
  ('go.checkin.gpsGood', 'GPS accuracy: Good ({m} m)', 2424),
  ('go.checkin.gpsWeak', 'GPS accuracy: Weak ({m} m). You can still check in.', 2425),
  ('go.checkin.gpsOff', 'Location is off. You can still check in.', 2426),
  ('go.checkin.range', 'Allowed range at customers: {m} m', 2427),
  ('go.checkin.refresh', 'Refresh', 2428),
  ('go.checkin.nearby', 'Nearby customers · {n}', 2429),
  ('go.checkin.nearestFirst', 'Nearest first', 2430),
  ('go.checkin.inRange', 'In range', 2431),
  ('go.checkin.outRange', 'Outside range', 2432),
  ('go.checkin.none', 'Check in without a customer', 2433),
  ('go.checkin.saved', 'Your location is saved with the check-in', 2434),
  ('go.checkin.go', 'Check in', 2435),
  ('go.checkin.goAt', 'Check in at {name}', 2436),
  ('go.checkin.failed', 'Could not check in. Try again.', 2437),
  ('go.checkin.loadError', 'Could not load nearby customers', 2438),
  ('go.checkin.already', 'You are already checked in', 2439),
  ('go.checkin.alreadyBody', 'Check out of your open visit before you check in somewhere else.', 2440)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.today.checkIn', 'ចូលជួបអតិថិជន'),
  ('go.today.atVisit', 'កំពុងជួប៖ {name}'),
  ('go.checkin.title', 'ចូលជួបអតិថិជន'),
  ('go.checkin.locating', 'កំពុងរកទីតាំងរបស់អ្នក'),
  ('go.checkin.gpsGood', 'ភាពត្រឹមត្រូវ GPS៖ ល្អ ({m} ម៉ែត្រ)'),
  ('go.checkin.gpsWeak', 'ភាពត្រឹមត្រូវ GPS៖ ខ្សោយ ({m} ម៉ែត្រ)។ អ្នកនៅតែអាចចូលបាន។'),
  ('go.checkin.gpsOff', 'ទីតាំងត្រូវបានបិទ។ អ្នកនៅតែអាចចូលបាន។'),
  ('go.checkin.range', 'ចម្ងាយអនុញ្ញាតនៅអតិថិជន៖ {m} ម៉ែត្រ'),
  ('go.checkin.refresh', 'ផ្ទុកឡើងវិញ'),
  ('go.checkin.nearby', 'អតិថិជនក្បែរនេះ · {n}'),
  ('go.checkin.nearestFirst', 'ជិតបំផុតមុន'),
  ('go.checkin.inRange', 'ក្នុងចម្ងាយ'),
  ('go.checkin.outRange', 'ក្រៅចម្ងាយ'),
  ('go.checkin.none', 'ចូលដោយគ្មានអតិថិជន'),
  ('go.checkin.saved', 'ទីតាំងរបស់អ្នកត្រូវបានរក្សាទុកជាមួយការចូល'),
  ('go.checkin.go', 'ចូលជួប'),
  ('go.checkin.goAt', 'ចូលជួប {name}'),
  ('go.checkin.failed', 'មិនអាចចូលបានទេ។ សូមព្យាយាមម្តងទៀត។'),
  ('go.checkin.loadError', 'មិនអាចផ្ទុកអតិថិជនក្បែរនេះបានទេ'),
  ('go.checkin.already', 'អ្នកបានចូលជួបរួចហើយ'),
  ('go.checkin.alreadyBody', 'សូមចេញពីការជួបបច្ចុប្បន្នមុននឹងចូលជួបកន្លែងផ្សេង។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
