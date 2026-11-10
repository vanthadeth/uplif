-- Migration 1: private app schema, core tenant tables, composite FKs, forced RLS (default deny).
create schema if not exists app;

create type public.data_scope as enum ('own', 'branch', 'company'); -- order matters: widest is last
create type public.membership_status as enum ('active', 'suspended', 'removed');

-- Generic triggers (no table references).
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function app.forbid_company_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable' using errcode = '23000';
  end if;
  return new;
end $$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.membership_status not null default 'active',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

-- Global catalog, keys are module.resource.action.
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
  description text not null
);

-- branch_id null = company-wide assignment. Composite FKs keep every reference inside one tenant.
create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  branch_id uuid,
  created_at timestamptz not null default now(),
  foreign key (company_id, membership_id) references public.memberships (company_id, id) on delete cascade,
  foreign key (company_id, role_id) references public.roles (company_id, id) on delete cascade,
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete cascade
);
create unique index membership_roles_unique_idx on public.membership_roles
  (membership_id, role_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index membership_roles_company_membership_idx on public.membership_roles (company_id, membership_id);
create index membership_roles_role_idx on public.membership_roles (company_id, role_id);

create table public.role_permissions (
  company_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  data_scope public.data_scope not null default 'own',
  primary key (role_id, permission_key),
  foreign key (company_id, role_id) references public.roles (company_id, id) on delete cascade
);
create index role_permissions_company_idx on public.role_permissions (company_id, role_id);
create index role_permissions_key_idx on public.role_permissions (permission_key);

create table public.company_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  cross_branch_stock_visibility boolean not null default false,
  attendance_selfie_retention_days integer not null default 60 check (attendance_selfie_retention_days >= 1),
  updated_at timestamptz not null default now()
);

-- Exactly one home currency per company.
create table public.company_currencies (
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{3}$'),
  is_home boolean not null default false,
  primary key (company_id, code)
);
create unique index company_currencies_one_home_idx on public.company_currencies (company_id) where is_home;

create table public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  name_local text,
  days integer not null check (days >= 0),
  unique (company_id, id),
  unique (company_id, name)
);

-- Not exposed to the API: no grants, no policies.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Which membership a user is currently working in (read by the auth hook only).
create table app.user_context (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_membership_id uuid references public.memberships (id) on delete set null
);

-- Triggers
create trigger touch_companies before update on public.companies for each row execute function app.touch_updated_at();
create trigger touch_branches before update on public.branches for each row execute function app.touch_updated_at();
create trigger touch_memberships before update on public.memberships for each row execute function app.touch_updated_at();
create trigger touch_roles before update on public.roles for each row execute function app.touch_updated_at();
create trigger touch_company_settings before update on public.company_settings for each row execute function app.touch_updated_at();

create trigger immutable_company_branches before update on public.branches for each row execute function app.forbid_company_change();
create trigger immutable_company_memberships before update on public.memberships for each row execute function app.forbid_company_change();
create trigger immutable_company_roles before update on public.roles for each row execute function app.forbid_company_change();
create trigger immutable_company_membership_roles before update on public.membership_roles for each row execute function app.forbid_company_change();
create trigger immutable_company_role_permissions before update on public.role_permissions for each row execute function app.forbid_company_change();
create trigger immutable_company_company_settings before update on public.company_settings for each row execute function app.forbid_company_change();
create trigger immutable_company_company_currencies before update on public.company_currencies for each row execute function app.forbid_company_change();
create trigger immutable_company_payment_terms before update on public.payment_terms for each row execute function app.forbid_company_change();

-- Deny by default: RLS on and forced everywhere, no API grants until migration 3.
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_settings enable row level security;
alter table public.company_currencies enable row level security;
alter table public.payment_terms enable row level security;
alter table public.platform_admins enable row level security;
alter table app.user_context enable row level security;

alter table public.companies force row level security;
alter table public.branches force row level security;
alter table public.memberships force row level security;
alter table public.roles force row level security;
alter table public.permissions force row level security;
alter table public.membership_roles force row level security;
alter table public.role_permissions force row level security;
alter table public.company_settings force row level security;
alter table public.company_currencies force row level security;
alter table public.payment_terms force row level security;
alter table public.platform_admins force row level security;
alter table app.user_context force row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke all on schema app from public, anon;
