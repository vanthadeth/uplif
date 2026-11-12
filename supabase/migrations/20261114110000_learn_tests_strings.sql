-- Strings for Learn tests in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.test.title', 'Tests', 1643),
  ('st.test.loading', 'Loading tests', 1644),
  ('st.test.error', 'Could not load the tests.', 1645),
  ('st.test.meta', '{n} questions · pass at {p}%', 1646),
  ('st.test.last', 'Last score {n}%', 1647),
  ('st.test.due', 'Retake by {date}', 1648),
  ('st.test.new', 'New', 1649),
  ('st.test.failed', 'Not passed', 1650),
  ('st.test.passed', 'Passed', 1651),
  ('st.test.dueSoon', 'Due soon', 1652),
  ('st.test.overdue', 'Overdue', 1653),
  ('st.test.start', 'Start test', 1654),
  ('st.test.retake', 'Retake test', 1655),
  ('st.test.q', 'Question {i} of {n}', 1656),
  ('st.test.next', 'Next', 1657),
  ('st.test.submit', 'Send answers', 1658),
  ('st.test.passTitle', 'You passed', 1659),
  ('st.test.failTitle', 'Not passed this time', 1660),
  ('st.test.result', 'You got {c} of {t} right ({n}%). The pass mark is {p}%.', 1661),
  ('st.test.again', 'Try again', 1662),
  ('st.test.done', 'Done', 1663),
  ('st.test.submitErr', 'Could not send your answers. Try again.', 1664),
  ('st.test.notDue', 'This test is not due yet.', 1665)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.test.title', 'តេស្ត'),
  ('st.test.loading', 'កំពុងផ្ទុកតេស្ត'),
  ('st.test.error', 'មិនអាចផ្ទុកតេស្តបានទេ។'),
  ('st.test.meta', '{n} សំណួរ · ជាប់ត្រឹម {p}%'),
  ('st.test.last', 'ពិន្ទុចុងក្រោយ {n}%'),
  ('st.test.due', 'ធ្វើឡើងវិញមុន {date}'),
  ('st.test.new', 'ថ្មី'),
  ('st.test.failed', 'មិនជាប់'),
  ('st.test.passed', 'ជាប់'),
  ('st.test.dueSoon', 'ជិតដល់ពេល'),
  ('st.test.overdue', 'ហួសកំណត់'),
  ('st.test.start', 'ចាប់ផ្តើមតេស្ត'),
  ('st.test.retake', 'ធ្វើតេស្តឡើងវិញ'),
  ('st.test.q', 'សំណួរទី {i} ក្នុងចំណោម {n}'),
  ('st.test.next', 'បន្ទាប់'),
  ('st.test.submit', 'ផ្ញើចម្លើយ'),
  ('st.test.passTitle', 'អ្នកបានជាប់'),
  ('st.test.failTitle', 'មិនបានជាប់លើកនេះ'),
  ('st.test.result', 'អ្នកឆ្លើយត្រូវ {c} ក្នុងចំណោម {t} ({n}%)។ ពិន្ទុជាប់គឺ {p}%។'),
  ('st.test.again', 'ព្យាយាមម្តងទៀត'),
  ('st.test.done', 'រួចរាល់'),
  ('st.test.submitErr', 'មិនអាចផ្ញើចម្លើយបានទេ។ សូមព្យាយាមម្តងទៀត។'),
  ('st.test.notDue', 'តេស្តនេះមិនទាន់ដល់ពេលទេ។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
