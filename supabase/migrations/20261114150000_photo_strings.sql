-- Strings for the profile photo in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.photo.change', 'Change photo', 1716),
  ('st.photo.remove', 'Remove photo', 1717),
  ('st.photo.saved', 'Photo saved.', 1718),
  ('st.photo.removed', 'Photo removed.', 1719),
  ('st.photo.error', 'Could not save the photo. Try a different picture.', 1720)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.photo.change', 'ប្តូររូបថត'),
  ('st.photo.remove', 'លុបរូបថត'),
  ('st.photo.saved', 'បានរក្សាទុករូបថត។'),
  ('st.photo.removed', 'បានលុបរូបថត។'),
  ('st.photo.error', 'មិនអាចរក្សាទុករូបថតបានទេ។ សូមសាកល្បងរូបផ្សេង។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
