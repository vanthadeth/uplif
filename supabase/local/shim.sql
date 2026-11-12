do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin','authenticator'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I %s', r, case r when 'service_role' then 'nologin bypassrls' when 'authenticator' then 'login noinherit' else 'nologin' end);
    end if;
  end loop;
  grant anon, authenticated, service_role to authenticator;
end $$;
create schema extensions; grant usage on schema extensions to public;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), aud text, role text, email text, phone text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, provider text not null, identity_data jsonb default '{}', created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant execute on all functions in schema auth to anon, authenticated, service_role, supabase_auth_admin;
create schema storage; grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'),1)-1,0)] $$;
grant execute on all functions in schema storage to public;
-- minimal pgTAP stand-in
create function extensions.no_plan() returns text language sql as $$ select set_config('tap.n','0',false) $$;
create function extensions._tap(p_ok boolean, p_desc text, p_diag text default null) returns text language plpgsql as $$
declare n int := coalesce(nullif(current_setting('tap.n', true),''),'0')::int + 1; s text;
begin perform set_config('tap.n', n::text, false);
  s := case when p_ok then 'ok ' else 'not ok ' end || n || ' - ' || coalesce(p_desc,'');
  if not p_ok and p_diag is not null then s := s || E'\n#   ' || p_diag; end if; return s; end $$;
create function extensions.ok(boolean, text default null) returns text language sql as $$ select extensions._tap(coalesce($1,false), $2) $$;
create function extensions.is(anyelement, anyelement, text default null) returns text language sql as $$ select extensions._tap($1 is not distinct from $2, $3, 'have: ' || coalesce($1::text,'NULL') || ' want: ' || coalesce($2::text,'NULL')) $$;
create function extensions.cmp_ok(anyelement, text, anyelement, text default null) returns text language plpgsql as $$
declare r boolean; begin execute format('select $1 %s $2', $2) into r using $1, $3; return extensions._tap(coalesce(r,false), $4, $1::text||' '||$2||' '||$3::text); end $$;
create function extensions.lives_ok(text, text default null) returns text language plpgsql as $$
begin execute $1; return extensions._tap(true, $2); exception when others then return extensions._tap(false, $2, SQLSTATE||' '||SQLERRM); end $$;
create function extensions.throws_ok(text, text, text, text default null) returns text language plpgsql as $$
begin execute $1; return extensions._tap(false, $4, 'no exception');
exception when others then
  return extensions._tap(($2 is null or SQLSTATE = $2) and ($3 is null or SQLERRM = $3), $4, 'got '||SQLSTATE||' '||SQLERRM||' want '||$2||' '||coalesce($3,'*')); end $$;
create function extensions.finish() returns setof text language sql as $$ select 'done'::text $$;
grant execute on all functions in schema extensions to public;
