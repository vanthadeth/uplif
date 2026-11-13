-- Strings for phone alerts in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.push.toggle', 'Alerts on this phone', 1838),
  ('st.push.hint', 'Get a short alert when something new arrives. It never shows details on your lock screen.', 1839),
  ('st.push.denied', 'Alerts are blocked for this app in your phone settings.', 1840),
  ('st.push.unsupported', 'This phone or browser cannot receive alerts here. On iPhone, add the app to your Home Screen first.', 1841),
  ('st.push.error', 'Could not change alerts. Try again.', 1842)
on conflict (key) do nothing;
insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.push.toggle', 'ការជូនដំណឹងនៅលើទូរស័ព្ទនេះ'),
  ('st.push.hint', 'ទទួលដំណឹងខ្លីៗនៅពេលមានអ្វីថ្មី។ វាមិនបង្ហាញព័ត៌មានលម្អិតនៅលើអេក្រង់ចាក់សោរបស់អ្នកទេ។'),
  ('st.push.denied', 'ការជូនដំណឹងត្រូវបានបិទសម្រាប់កម្មវិធីនេះនៅក្នុងការកំណត់ទូរស័ព្ទរបស់អ្នក។'),
  ('st.push.unsupported', 'ទូរស័ព្ទ ឬកម្មវិធីរុករកនេះមិនអាចទទួលការជូនដំណឹងនៅទីនេះបានទេ។ នៅលើ iPhone សូមបន្ថែមកម្មវិធីទៅអេក្រង់ដើមជាមុនសិន។'),
  ('st.push.error', 'មិនអាចប្តូរការជូនដំណឹងបានទេ។ សូមព្យាយាមម្តងទៀត។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
