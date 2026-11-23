-- Strings for the consent notice dialog in UPLIF Me (selfie and location use).
-- Khmer entries are machine drafts for the Khmer reviewer at /i18n; a reviewer's pinned or voted text is never overwritten.
insert into public.i18n_strings (key, source_text, position) values
  ('st.privacy.later', 'Not now', 4730),
  ('st.privacy.p1', 'One selfie and your location are saved each time you clock in or out.', 4731),
  ('st.privacy.p2', 'Nothing is tracked at any other time.', 4732),
  ('st.privacy.p3', 'Your manager can review them.', 4733),
  ('st.privacy.p4', 'Selfies are deleted after the time your company sets.', 4734)
on conflict (key) do nothing;
