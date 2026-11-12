-- Strings for the clock-in location step. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.locate.title', 'Finding your location', 1506),
  ('st.locate.none', 'Waiting for a signal', 1507),
  ('st.locate.acc', 'Accuracy ±{m} m', 1508),
  ('st.locate.waiting', 'Waiting for {m} m or better', 1509),
  ('st.locate.countdown', '{s} s left', 1510),
  ('st.locate.progress', 'Location accuracy progress', 1511),
  ('st.locate.weak.title', 'Weak GPS signal', 1512),
  ('st.locate.weak.body', 'You can still clock in. Your manager may review this clock.', 1513),
  ('st.locate.denied.body', 'Location is off or blocked. You can still clock in. Your manager may review this clock.', 1514),
  ('st.locate.continue', 'Continue to selfie', 1515),
  ('st.locate.retry', 'Try again', 1516)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.locate.title', 'កំពុងស្វែងរកទីតាំងរបស់អ្នក'),
  ('st.locate.none', 'កំពុងរង់ចាំសញ្ញា'),
  ('st.locate.acc', 'ភាពត្រឹមត្រូវ ±{m} ម៉ែត្រ'),
  ('st.locate.waiting', 'កំពុងរង់ចាំ {m} ម៉ែត្រ ឬល្អជាងនេះ'),
  ('st.locate.countdown', 'នៅសល់ {s} វិនាទី'),
  ('st.locate.progress', 'វឌ្ឍនភាពនៃភាពត្រឹមត្រូវនៃទីតាំង'),
  ('st.locate.weak.title', 'សញ្ញា GPS ខ្សោយ'),
  ('st.locate.weak.body', 'អ្នកនៅតែអាចកត់ម៉ោងបាន។ អ្នកគ្រប់គ្រងរបស់អ្នកអាចពិនិត្យការកត់ម៉ោងនេះ។'),
  ('st.locate.denied.body', 'ទីតាំងត្រូវបានបិទ ឬរារាំង។ អ្នកនៅតែអាចកត់ម៉ោងបាន។ អ្នកគ្រប់គ្រងរបស់អ្នកអាចពិនិត្យការកត់ម៉ោងនេះ។'),
  ('st.locate.continue', 'បន្តទៅថតសែលហ្វី'),
  ('st.locate.retry', 'ព្យាយាមម្តងទៀត')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
