-- Migration 11: allow any supported UI language on a profile, not just English and Khmer.
-- The console keeps the list of supported languages; the database only checks the shape of the code
-- (two or three lowercase letters, optional region such as pt-BR), so adding a language is a config change.
alter table public.profiles drop constraint profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check
  check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$');
