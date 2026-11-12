-- Strings for Performance in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.record.perf.sub', 'Your score and what you are measured on', 1703),
  ('st.perf.title', 'Performance', 1704),
  ('st.perf.loading', 'Loading performance', 1705),
  ('st.perf.error', 'Could not load your performance.', 1706),
  ('st.perf.latest', 'Latest review, {month}', 1707),
  ('st.perf.noReview', 'No review yet', 1708),
  ('st.perf.noReviewBody', 'Your manager scores you each month. Your score will show here.', 1709),
  ('st.perf.note', 'Note from your manager: {note}', 1710),
  ('st.perf.kpis', 'What you are measured on', 1711),
  ('st.perf.noKpis', 'No KPIs are set for your position yet.', 1712),
  ('st.perf.weight', 'Weight {n}', 1713),
  ('st.perf.notScored', 'Not scored yet', 1714),
  ('st.perf.history', 'Earlier reviews', 1715)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.record.perf.sub', 'ពិន្ទុរបស់អ្នក និងអ្វីដែលអ្នកត្រូវបានវាស់វែង'),
  ('st.perf.title', 'ការអនុវត្ត'),
  ('st.perf.loading', 'កំពុងផ្ទុកការអនុវត្ត'),
  ('st.perf.error', 'មិនអាចផ្ទុកការអនុវត្តរបស់អ្នកបានទេ។'),
  ('st.perf.latest', 'ការវាយតម្លៃចុងក្រោយ {month}'),
  ('st.perf.noReview', 'មិនទាន់មានការវាយតម្លៃទេ'),
  ('st.perf.noReviewBody', 'អ្នកគ្រប់គ្រងដាក់ពិន្ទុអ្នកជារៀងរាល់ខែ។ ពិន្ទុរបស់អ្នកនឹងបង្ហាញនៅទីនេះ។'),
  ('st.perf.note', 'កំណត់ចំណាំពីអ្នកគ្រប់គ្រង៖ {note}'),
  ('st.perf.kpis', 'អ្វីដែលអ្នកត្រូវបានវាស់វែង'),
  ('st.perf.noKpis', 'មិនទាន់មាន KPI សម្រាប់មុខតំណែងរបស់អ្នកទេ។'),
  ('st.perf.weight', 'ទម្ងន់ {n}'),
  ('st.perf.notScored', 'មិនទាន់ដាក់ពិន្ទុ'),
  ('st.perf.history', 'ការវាយតម្លៃមុនៗ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
