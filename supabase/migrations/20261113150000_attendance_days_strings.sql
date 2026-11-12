-- Strings for the daily attendance results shown in UPLIF Me.
-- Khmer entries are machine drafts for the Khmer reviewer at /i18n; a reviewer's pinned or voted text is never overwritten.
insert into public.i18n_strings (key, source_text, position) values
  ('st.att.late', 'Late {m}', 1420),
  ('st.att.early', 'Left early {m}', 1421),
  ('st.att.incomplete', 'No clock-out', 1422),
  ('st.att.absent', 'Absent', 1423),
  ('st.att.extra', 'Extra day', 1424),
  ('st.att.ontime', 'On time', 1425),
  ('st.att.overtime', '{m} overtime', 1426)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.att.late', 'យឺត {m}'),
  ('st.att.early', 'ចេញមុន {m}'),
  ('st.att.incomplete', 'មិនបានកត់ម៉ោងចេញ'),
  ('st.att.absent', 'អវត្តមាន'),
  ('st.att.extra', 'ថ្ងៃបន្ថែម'),
  ('st.att.ontime', 'ទាន់ពេល'),
  ('st.att.overtime', 'ថែមម៉ោង {m}')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
