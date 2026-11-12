-- Migration 24: force row-level security on the translation tables.
-- They are closed (no direct access for anon/authenticated); the i18n_* functions are the only way in.
-- Forcing RLS makes sure even the table owner is held to the policies if one is ever used through a plain connection.
alter table public.i18n_languages   force row level security;
alter table public.i18n_strings     force row level security;
alter table public.i18n_suggestions force row level security;
alter table public.i18n_votes       force row level security;
alter table public.i18n_pins        force row level security;
alter table public.i18n_reviewers   force row level security;
