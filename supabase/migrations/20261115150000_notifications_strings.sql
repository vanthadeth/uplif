-- Strings for notifications in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.notif.leave_approved', 'Your leave request for {range} was approved.', 1825),
  ('st.notif.leave_rejected', 'Your leave request for {range} was not approved.', 1826),
  ('st.notif.amendment_approved', 'Your attendance correction for {date} was approved.', 1827),
  ('st.notif.amendment_rejected', 'Your attendance correction for {date} was not approved.', 1828),
  ('st.notif.performance_review', 'Your performance review for {month} is ready: {percent}%.', 1829),
  ('st.notif.promotion', 'You were promoted to {position}.', 1830),
  ('st.notif.transfer', 'You were moved to {position}.', 1831),
  ('st.notif.toggle', 'Notify me in the app', 1832),
  ('st.notif.toggle.hint', 'Turn off to stop new updates here. Earlier ones stay.', 1833),
  ('st.notif.markAll', 'Mark all as read', 1834),
  ('st.notif.error', 'Could not load notifications.', 1835),
  ('st.notif.loading', 'Loading notifications', 1836),
  ('st.bar.unread', 'Notifications, {n} unread', 1837)
on conflict (key) do nothing;
insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.notif.leave_approved', 'សំណើសុំច្បាប់របស់អ្នកសម្រាប់ {range} ត្រូវបានអនុម័ត។'),
  ('st.notif.leave_rejected', 'សំណើសុំច្បាប់របស់អ្នកសម្រាប់ {range} មិនត្រូវបានអនុម័តទេ។'),
  ('st.notif.amendment_approved', 'ការកែតម្រូវវត្តមានរបស់អ្នកសម្រាប់ {date} ត្រូវបានអនុម័ត។'),
  ('st.notif.amendment_rejected', 'ការកែតម្រូវវត្តមានរបស់អ្នកសម្រាប់ {date} មិនត្រូវបានអនុម័តទេ។'),
  ('st.notif.performance_review', 'ការវាយតម្លៃការអនុវត្តរបស់អ្នកសម្រាប់ {month} រួចរាល់ហើយ៖ {percent}%។'),
  ('st.notif.promotion', 'អ្នកត្រូវបានតម្លើងតួនាទីជា {position}។'),
  ('st.notif.transfer', 'អ្នកត្រូវបានផ្លាស់ប្តូរទៅ {position}។'),
  ('st.notif.toggle', 'ជូនដំណឹងខ្ញុំក្នុងកម្មវិធី'),
  ('st.notif.toggle.hint', 'បិទដើម្បីឈប់ទទួលដំណឹងថ្មីនៅទីនេះ។ ដំណឹងមុនៗនៅដដែល។'),
  ('st.notif.markAll', 'សម្គាល់ថាបានអានទាំងអស់'),
  ('st.notif.error', 'មិនអាចផ្ទុកការជូនដំណឹងបានទេ។'),
  ('st.notif.loading', 'កំពុងផ្ទុកការជូនដំណឹង'),
  ('st.bar.unread', 'ការជូនដំណឹង មាន {n} មិនទាន់អាន')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
