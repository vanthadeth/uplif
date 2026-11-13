-- Strings for offline clock-in in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.offline.ok', 'You are offline. You can still clock in. It is saved on your phone and sent when you have signal.', 1817),
  ('st.done.queued', 'Saved on your phone. It will be sent when you have signal.', 1818),
  ('st.flag.offline', 'Saved without signal and sent later.', 1819),
  ('st.out.waiting', 'Waiting to send', 1820),
  ('st.out.banner', '{n} saved on your phone, waiting to send.', 1821),
  ('st.out.send', 'Send now', 1822),
  ('st.out.failed', 'A clock saved on your phone could not be accepted, for example because it is over 7 days old. You can ask for a correction under Record > Attendance.', 1823),
  ('st.out.dismiss', 'Dismiss', 1824)
on conflict (key) do nothing;
insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.offline.ok', 'អ្នកគ្មានអ៊ីនធឺណិត។ អ្នកនៅតែអាចកត់ម៉ោងបាន។ វាត្រូវបានរក្សាទុកក្នុងទូរស័ព្ទ ហើយផ្ញើនៅពេលមានអ៊ីនធឺណិត។'),
  ('st.done.queued', 'បានរក្សាទុកក្នុងទូរស័ព្ទ។ វានឹងត្រូវបានផ្ញើនៅពេលមានអ៊ីនធឺណិត។'),
  ('st.flag.offline', 'បានរក្សាទុកពេលគ្មានអ៊ីនធឺណិត ហើយផ្ញើក្រោយ។'),
  ('st.out.waiting', 'កំពុងរង់ចាំផ្ញើ'),
  ('st.out.banner', 'មាន {n} បានរក្សាទុកក្នុងទូរស័ព្ទ កំពុងរង់ចាំផ្ញើ។'),
  ('st.out.send', 'ផ្ញើឥឡូវនេះ'),
  ('st.out.failed', 'ការកត់ម៉ោងដែលបានរក្សាទុកក្នុងទូរស័ព្ទមិនត្រូវបានទទួលយកទេ ឧទាហរណ៍ព្រោះលើសពី 7 ថ្ងៃ។ អ្នកអាចស្នើសុំការកែតម្រូវនៅក្នុង កំណត់ត្រា > វត្តមាន។'),
  ('st.out.dismiss', 'បិទ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
