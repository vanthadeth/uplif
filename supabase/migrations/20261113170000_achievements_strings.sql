-- Strings for automatic achievements in UPLIF Me.
-- Khmer entries are machine drafts for the Khmer reviewer at /i18n; a reviewer's pinned or voted text is never overwritten.
insert into public.i18n_strings (key, source_text, position) values
  ('st.record.ach.sub', 'Earned from your attendance', 1440),
  ('st.ach.thisMonth', 'This month', 1441),
  ('st.ach.progress', '{n} of {total} work days on time so far', 1442),
  ('st.ach.progress.none', 'Nothing to count yet this month.', 1443),
  ('st.ach.ontrack', 'You are on track for 100% green attendance.', 1444),
  ('st.ach.missed', 'A green month needs every work day on time, so this month will not count.', 1445),
  ('st.ach.earned', 'Earned', 1446),
  ('st.ach.green', '100% green attendance', 1447),
  ('st.ach.tenure', '{n} years with us', 1448),
  ('st.ach.tenure.one', 'One year with us', 1449),
  ('st.ach.empty.title', 'No achievements yet', 1450),
  ('st.ach.empty.body', 'Finish a month with every work day on time to earn 100% green attendance.', 1451),
  ('st.ach.rule', '100% green means every work day in the month had a clock-in and a clock-out on time.', 1452),
  ('st.ach.error', 'Your achievements could not be loaded. Check your connection and try again.', 1453),
  ('st.ach.loading', 'Loading your achievements', 1454)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.record.ach.sub', 'ទទួលបានពីវត្តមានរបស់អ្នក'),
  ('st.ach.thisMonth', 'ខែនេះ'),
  ('st.ach.progress', 'ទាន់ម៉ោង {n} ក្នុងចំណោម {total} ថ្ងៃធ្វើការរហូតមកដល់ពេលនេះ'),
  ('st.ach.progress.none', 'មិនទាន់មានអ្វីត្រូវរាប់ក្នុងខែនេះទេ។'),
  ('st.ach.ontrack', 'អ្នកកំពុងឈានទៅរកវត្តមានបៃតង 100%។'),
  ('st.ach.missed', 'ខែបៃតងត្រូវការគ្រប់ថ្ងៃធ្វើការទាន់ម៉ោង ដូច្នេះខែនេះនឹងមិនរាប់ទេ។'),
  ('st.ach.earned', 'ទទួលបាន'),
  ('st.ach.green', 'វត្តមានបៃតង 100%'),
  ('st.ach.tenure', '{n} ឆ្នាំជាមួយយើង'),
  ('st.ach.tenure.one', 'មួយឆ្នាំជាមួយយើង'),
  ('st.ach.empty.title', 'មិនទាន់មានសមិទ្ធផលទេ'),
  ('st.ach.empty.body', 'បញ្ចប់មួយខែដោយទាន់ម៉ោងគ្រប់ថ្ងៃធ្វើការ ដើម្បីទទួលបានវត្តមានបៃតង 100%។'),
  ('st.ach.rule', 'បៃតង 100% មានន័យថាគ្រប់ថ្ងៃធ្វើការក្នុងខែមានការកត់ម៉ោងចូល និងចេញទាន់ពេល។'),
  ('st.ach.error', 'មិនអាចផ្ទុកសមិទ្ធផលរបស់អ្នកបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។'),
  ('st.ach.loading', 'កំពុងផ្ទុកសមិទ្ធផលរបស់អ្នក')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
