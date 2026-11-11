# Local database checks

`run-tests.sh` applies every migration to a throwaway Postgres 16 database and runs every file in `supabase/tests`,
so isolation tests can run without a Supabase project. It needs a scratch Postgres server you can create databases
on (set the usual `PGHOST`, `PGPORT`, `PGUSER`). It is a stand-in, not Supabase itself:

- `shim.sql` creates the Supabase roles, `auth.users` / `auth.uid()`, a minimal `storage` schema, and a small
  pgTAP look-alike (`ok`, `is`, `cmp_ok`, `lives_ok`, `throws_ok`). The real pgTAP is used on Supabase.
- `20261110090400_revoke_rls_auto_enable.sql` is skipped because it targets a Supabase-only function.

A green run here is strong evidence, not a replacement for running the same files on the real project.
