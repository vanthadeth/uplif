-- Strings for the redesigned Record tab. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.record.tile.onTime', 'On time this month', 1503),
  ('st.record.tile.earned', 'Earned so far', 1504),
  ('st.record.more', 'More', 1505)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.record.tile.onTime', 'ទាន់ម៉ោងក្នុងខែនេះ'),
  ('st.record.tile.earned', 'ទទួលបានរហូតមកដល់ពេលនេះ'),
  ('st.record.more', 'ផ្សេងទៀត')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
