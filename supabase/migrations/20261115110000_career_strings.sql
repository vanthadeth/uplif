-- Strings for Job and career in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.record.jd.sub', 'What your job involves and how you have grown', 1800),
  ('st.job.title', 'Job and career', 1801),
  ('st.job.loading', 'Loading your job', 1802),
  ('st.job.error', 'Could not load your job details.', 1803),
  ('st.job.noPosition', 'You have no position yet', 1804),
  ('st.job.noPositionBody', 'Your manager will assign one.', 1805),
  ('st.job.duties', 'Your duties', 1806),
  ('st.job.noDesc', 'No description yet', 1807),
  ('st.job.noDescBody', 'Your company has not written one for this position.', 1808),
  ('st.job.kpis', 'See what you are measured on', 1809),
  ('st.job.history', 'Your career', 1810),
  ('st.job.noHistory', 'No promotions yet', 1811),
  ('st.job.noHistoryBody', 'Promotions and transfers appear here.', 1812),
  ('st.job.promotion', 'Promotion', 1813),
  ('st.job.transfer', 'Transfer', 1814),
  ('st.job.line', '{from} to {to}', 1815),
  ('st.job.note', 'Note: {note}', 1816)
on conflict (key) do nothing;
insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.record.jd.sub', 'អ្វីដែលការងាររបស់អ្នកពាក់ព័ន្ធ និងការរីកចម្រើនរបស់អ្នក'),
  ('st.job.title', 'ការងារ និងអាជីព'),
  ('st.job.loading', 'កំពុងផ្ទុកការងាររបស់អ្នក'),
  ('st.job.error', 'មិនអាចផ្ទុកព័ត៌មានការងាររបស់អ្នកបានទេ។'),
  ('st.job.noPosition', 'អ្នកមិនទាន់មានមុខតំណែងទេ'),
  ('st.job.noPositionBody', 'អ្នកគ្រប់គ្រងរបស់អ្នកនឹងកំណត់ឱ្យ។'),
  ('st.job.duties', 'កាតព្វកិច្ចរបស់អ្នក'),
  ('st.job.noDesc', 'មិនទាន់មានការពិពណ៌នាទេ'),
  ('st.job.noDescBody', 'ក្រុមហ៊ុនរបស់អ្នកមិនទាន់សរសេរសម្រាប់មុខតំណែងនេះទេ។'),
  ('st.job.kpis', 'មើលអ្វីដែលអ្នកត្រូវបានវាស់វែង'),
  ('st.job.history', 'អាជីពរបស់អ្នក'),
  ('st.job.noHistory', 'មិនទាន់មានការតម្លើងតួនាទីទេ'),
  ('st.job.noHistoryBody', 'ការតម្លើងតួនាទី និងការផ្លាស់ប្តូរនឹងបង្ហាញនៅទីនេះ។'),
  ('st.job.promotion', 'ការតម្លើងតួនាទី'),
  ('st.job.transfer', 'ការផ្លាស់ប្តូរ'),
  ('st.job.line', '{from} ទៅ {to}'),
  ('st.job.note', 'កំណត់ចំណាំ៖ {note}')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
