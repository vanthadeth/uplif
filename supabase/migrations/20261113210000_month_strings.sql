-- Strings for the month attendance calendar. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.mon.prev', 'Previous month', 1517),
  ('st.mon.next', 'Next month', 1518),
  ('st.mon.present', 'Present', 1519),
  ('st.mon.absent', 'Absent', 1520),
  ('st.mon.late', 'Late', 1521),
  ('st.mon.of', '{n} of {total}', 1522),
  ('st.mon.holidays', 'Holidays in {month}', 1523),
  ('st.mon.noHolidays', 'No holidays this month.', 1524)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.mon.prev', 'ខែមុន'),
  ('st.mon.next', 'ខែបន្ទាប់'),
  ('st.mon.present', 'មានវត្តមាន'),
  ('st.mon.absent', 'អវត្តមាន'),
  ('st.mon.late', 'យឺត'),
  ('st.mon.of', '{n} ក្នុងចំណោម {total}'),
  ('st.mon.holidays', 'ថ្ងៃឈប់សម្រាកក្នុងខែ{month}'),
  ('st.mon.noHolidays', 'គ្មានថ្ងៃឈប់សម្រាកក្នុងខែនេះទេ។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
