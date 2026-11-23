-- UPLIF Time, slice T3: pay setup and the salary permissions.
-- Salary is the most sensitive data in the product, so:
--  * Salary data lives in its own tables. Nobody gets a direct write grant; every change goes through a function below.
--  * The tables can be read only by a person who holds the payroll permission at COMPANY scope. There is no team or branch
--    scope for salary: a manager can never see their team's pay. (A membership tied to one branch is downgraded to branch
--    scope by app.permission_scope, so it never counts as company scope.)
--  * The audit log records that a pay value changed, never the amount. payroll_events keeps the full detail and is readable
--    only with payroll.terms.view.
--  * Everything needs the Attendance module (Time is built on it).
--  * Reference salary, achievement salary and commission rate are reference values: they pre-fill draft payslips later and
--    never decide a payment by themselves.
-- Permissions: payroll.terms.view/manage, payroll.payslip.view/prepare/post, payroll.run.manage, payroll.report.export,
-- payroll.settings.manage. This slice uses terms.* and settings.manage; the others are used by the payslip slices.
insert into public.permissions (key, description, description_local) values
  ('payroll.terms.view', 'See salary, commission rate and payment accounts', 'មើលប្រាក់ខែ អត្រាកម្រៃជើងសារ និងគណនីទូទាត់'),
  ('payroll.terms.manage', 'Set salary, commission rate and payment accounts', 'កំណត់ប្រាក់ខែ អត្រាកម្រៃជើងសារ និងគណនីទូទាត់'),
  ('payroll.payslip.view', 'See everyone''s payslips and the payroll report', 'មើលប័ណ្ណបើកប្រាក់ខែ និងរបាយការណ៍ប្រាក់ខែរបស់អ្នកគ្រប់គ្នា'),
  ('payroll.payslip.prepare', 'Prepare payslips and add or deduct lines', 'រៀបចំប័ណ្ណបើកប្រាក់ខែ និងបន្ថែម ឬកាត់បន្ថយបន្ទាត់'),
  ('payroll.payslip.post', 'Post payslips to employees', 'បង្ហោះប័ណ្ណបើកប្រាក់ខែទៅបុគ្គលិក'),
  ('payroll.run.manage', 'Open, close, mark paid and lock pay runs', 'បើក បិទ កត់ត្រាការបើកប្រាក់ និងចាក់សោការបើកប្រាក់ខែ'),
  ('payroll.report.export', 'Download the payroll report and payslip files', 'ទាញយករបាយការណ៍ប្រាក់ខែ និងឯកសារប័ណ្ណបើកប្រាក់ខែ'),
  ('payroll.settings.manage', 'Set pay plans, rules and payroll settings', 'កំណត់គម្រោងបើកប្រាក់ ច្បាប់ និងការកំណត់ប្រាក់ខែ')
on conflict (key) do nothing;

-- Owner and Admin: everything. Accountant: look and report, never change.
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, p.key, 'company'
from public.roles ro cross join public.permissions p
where ro.is_system and ro.name in ('Owner', 'Admin') and p.key like 'payroll.%'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, 'company'
from public.roles ro cross join (values ('payroll.terms.view'), ('payroll.payslip.view'), ('payroll.report.export')) as k(key)
where ro.is_system and ro.name = 'Accountant'
on conflict do nothing;

create function app.seed_payroll_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Accountant' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'payroll.terms.view', 'company'), (new.company_id, new.id, 'payroll.payslip.view', 'company'),
           (new.company_id, new.id, 'payroll.report.export', 'company')
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function app.seed_payroll_defaults() from public, anon, authenticated;
create trigger roles_seed_payroll_defaults after insert on public.roles for each row execute function app.seed_payroll_defaults();

-- True only for an active member of the company whose plan has Attendance and who holds the key at company scope.
create function app.payroll_can(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a person with no grant gets a null scope, and "not null" must never let a caller through.
  select coalesce(app.is_active_member() and app.module_enabled(app.company_id(), 'attendance')
                  and app.permission_scope(p_key) = 'company', false)
$$;
revoke all on function app.payroll_can(text) from public, anon;
grant execute on function app.payroll_can(text) to authenticated;

-- ---------- tables ----------
create table public.pay_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code = upper(code) and length(code) between 1 and 12),
  name text not null check (length(btrim(name)) between 1 and 80),
  name_local text check (name_local is null or length(name_local) <= 80),
  kind text not null check (kind in ('earning', 'deduction')),
  category text not null check (category in ('salary', 'achievement', 'commission', 'bonus', 'allowance', 'overtime', 'leave', 'attendance', 'fine', 'advance', 'tax', 'other')),
  reference_only boolean not null default false,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.employee_pay_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  pay_item_id uuid not null,
  amount numeric(14,2) check (amount is null or amount >= 0),
  rate_pct numeric(6,3) check (rate_pct is null or (rate_pct >= 0 and rate_pct <= 100)),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  effective_from date not null,
  effective_to date,
  note text check (note is null or length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (amount is not null or rate_pct is not null),
  check (effective_to is null or effective_to >= effective_from),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, pay_item_id) references public.pay_items (company_id, id),
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by)
);
create unique index employee_pay_terms_current_idx on public.employee_pay_terms (company_id, employee_id, pay_item_id) where effective_to is null;
create index employee_pay_terms_employee_idx on public.employee_pay_terms (company_id, employee_id, pay_item_id, effective_from);

create table public.employee_pay_profiles (
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  pay_currency text not null check (pay_currency ~ '^[A-Z]{3}$'),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'wing', 'aba', 'other')),
  account_name text check (account_name is null or length(account_name) <= 120),
  account_no text check (account_no is null or length(account_no) <= 60),
  bank_name text check (bank_name is null or length(bank_name) <= 80),
  note text check (note is null or length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (company_id, employee_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);

create table public.payroll_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  rate_divisor text not null default '26' check (rate_divisor in ('26', '30', 'scheduled')),
  overtime_multiplier numeric(4,2) not null default 1.5 check (overtime_multiplier between 1 and 5),
  require_second_approver boolean not null default false,
  close_blocks_on_review boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.payroll_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_membership_id uuid,
  at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index payroll_events_company_idx on public.payroll_events (company_id, at desc);

create trigger touch_pay_items before update on public.pay_items for each row execute function app.touch_updated_at();
create trigger touch_employee_pay_profiles before update on public.employee_pay_profiles for each row execute function app.touch_updated_at();
create trigger touch_payroll_settings before update on public.payroll_settings for each row execute function app.touch_updated_at();
create trigger immutable_company_pay_items before update on public.pay_items for each row execute function app.forbid_company_change();
create trigger immutable_company_employee_pay_terms before update on public.employee_pay_terms for each row execute function app.forbid_company_change();
create trigger immutable_company_employee_pay_profiles before update on public.employee_pay_profiles for each row execute function app.forbid_company_change();
create trigger immutable_company_payroll_settings before update on public.payroll_settings for each row execute function app.forbid_company_change();

create function app.payroll_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'payroll_events is append-only' using errcode = '42501';
end $$;
create trigger payroll_events_no_update before update on public.payroll_events for each row execute function app.payroll_events_append_only();
create trigger payroll_events_no_delete before delete on public.payroll_events for each row execute function app.payroll_events_append_only();

-- The audit log says that something changed, never the amount.
create function app.audit_payroll_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record := case when tg_op = 'DELETE' then old else new end;
begin
  if app.membership_id() is not null and r.company_id = app.company_id() then
    perform app.write_audit(r.company_id, app.membership_id(), tg_table_name || '.' || lower(tg_op), tg_table_name,
                            coalesce(to_jsonb(r) ->> 'employee_id', to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'company_id')::uuid, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end $$;
revoke all on function app.audit_payroll_row() from public, anon, authenticated;
create trigger audit_employee_pay_terms after insert or update on public.employee_pay_terms for each row execute function app.audit_payroll_row();
create trigger audit_employee_pay_profiles after insert or update on public.employee_pay_profiles for each row execute function app.audit_payroll_row();
create trigger audit_payroll_settings after insert or update on public.payroll_settings for each row execute function app.audit_payroll_row();

-- ---------- RLS: read only with the permission at company scope, never write directly ----------
alter table public.pay_items enable row level security;
alter table public.pay_items force row level security;
alter table public.employee_pay_terms enable row level security;
alter table public.employee_pay_terms force row level security;
alter table public.employee_pay_profiles enable row level security;
alter table public.employee_pay_profiles force row level security;
alter table public.payroll_settings enable row level security;
alter table public.payroll_settings force row level security;
alter table public.payroll_events enable row level security;
alter table public.payroll_events force row level security;
create policy pay_items_select on public.pay_items for select to authenticated
  using (company_id = (select app.company_id()) and ((select app.payroll_can('payroll.terms.view')) or (select app.payroll_can('payroll.payslip.view'))));
create policy employee_pay_terms_select on public.employee_pay_terms for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can('payroll.terms.view')));
create policy employee_pay_profiles_select on public.employee_pay_profiles for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can('payroll.terms.view')));
create policy payroll_settings_select on public.payroll_settings for select to authenticated
  using (company_id = (select app.company_id()) and ((select app.payroll_can('payroll.terms.view')) or (select app.payroll_can('payroll.settings.manage'))));
create policy payroll_events_select on public.payroll_events for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can('payroll.terms.view')));
grant select on public.pay_items, public.employee_pay_terms, public.employee_pay_profiles, public.payroll_settings, public.payroll_events to authenticated;

-- ---------- default pay items for every company, now and later ----------
create function app.seed_pay_items(p_company_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.pay_items (company_id, code, name, name_local, kind, category, reference_only, position) values
    (p_company_id, 'BASIC', 'Fixed salary', 'ប្រាក់ខែថេរ', 'earning', 'salary', true, 1),
    (p_company_id, 'ACHV', 'Achievement salary', 'ប្រាក់ខែតាមសមិទ្ធផល', 'earning', 'achievement', true, 2),
    (p_company_id, 'COMM', 'Commission', 'កម្រៃជើងសារ', 'earning', 'commission', true, 3),
    (p_company_id, 'BONUS', 'Bonus', 'ប្រាក់រង្វាន់', 'earning', 'bonus', false, 4),
    (p_company_id, 'ALLOW', 'Allowance', 'ប្រាក់ឧបត្ថម្ភ', 'earning', 'allowance', false, 5),
    (p_company_id, 'OT', 'Overtime', 'ម៉ោងបន្ថែម', 'earning', 'overtime', false, 6),
    (p_company_id, 'UNPAID', 'Unpaid leave', 'ច្បាប់គ្មានប្រាក់ខែ', 'deduction', 'leave', false, 7),
    (p_company_id, 'ABSENT', 'Absence', 'អវត្តមាន', 'deduction', 'attendance', false, 8),
    (p_company_id, 'LATE', 'Late', 'មកយឺត', 'deduction', 'attendance', false, 9),
    (p_company_id, 'FINE', 'Misconduct', 'ការប្រព្រឹត្តខុស', 'deduction', 'fine', false, 10),
    (p_company_id, 'ADVANCE', 'Advance repayment', 'សងប្រាក់ទុកមុន', 'deduction', 'advance', false, 11),
    (p_company_id, 'TAX', 'Tax', 'ពន្ធ', 'deduction', 'tax', false, 12),
    (p_company_id, 'NSSF', 'Social security', 'សន្តិសុខសង្គម', 'deduction', 'other', false, 13)
  on conflict (company_id, code) do nothing;
$$;
revoke execute on function app.seed_pay_items(uuid) from public, anon, authenticated;
select app.seed_pay_items(id) from public.companies;
create function app.seed_pay_items_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_pay_items(new.id);
  insert into public.payroll_settings (company_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function app.seed_pay_items_trg() from public, anon, authenticated;
create trigger seed_pay_items after insert on public.companies for each row execute function app.seed_pay_items_trg();
insert into public.payroll_settings (company_id) select id from public.companies on conflict do nothing;

-- ---------- functions ----------
create function app.payroll_event(p_employee_id uuid, p_action text, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.payroll_events (company_id, employee_id, action, detail, actor_membership_id)
  values (app.company_id(), p_employee_id, p_action, coalesce(p_detail, '{}'::jsonb), app.membership_id())
$$;
revoke all on function app.payroll_event(uuid, text, jsonb) from public, anon, authenticated;

create function public.payroll_pay_items()
returns table (id uuid, code text, name text, name_local text, kind text, category text, reference_only boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.payroll_can('payroll.terms.view') or app.payroll_can('payroll.payslip.view')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select i.id, i.code, i.name, i.name_local, i.kind, i.category, i.reference_only
    from public.pay_items i where i.company_id = app.company_id() and i.active order by i.position, i.code;
end $$;
revoke all on function public.payroll_pay_items() from public, anon;
grant execute on function public.payroll_pay_items() to authenticated;

-- One row per active employee with the reference values that are in force today.
create function public.payroll_people()
returns table (employee_id uuid, name text, name_local text, branch_id uuid, position_name text, position_name_local text,
               pay_currency text, payment_method text, fixed_amount numeric, achievement_amount numeric, commission_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not app.payroll_can('payroll.terms.view') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.name, e.name_local, e.branch_id, p.name, p.name_local, pr.pay_currency, pr.payment_method,
      (select t.amount from public.employee_pay_terms t join public.pay_items i on i.company_id = t.company_id and i.id = t.pay_item_id
        where t.company_id = cid and t.employee_id = e.id and t.effective_to is null and i.category = 'salary' and i.code = 'BASIC'),
      (select t.amount from public.employee_pay_terms t join public.pay_items i on i.company_id = t.company_id and i.id = t.pay_item_id
        where t.company_id = cid and t.employee_id = e.id and t.effective_to is null and i.category = 'achievement'),
      (select t.rate_pct from public.employee_pay_terms t join public.pay_items i on i.company_id = t.company_id and i.id = t.pay_item_id
        where t.company_id = cid and t.employee_id = e.id and t.effective_to is null and i.category = 'commission')
    from public.employees e
    left join public.positions p on p.company_id = e.company_id and p.id = e.position_id
    left join public.employee_pay_profiles pr on pr.company_id = e.company_id and pr.employee_id = e.id
    where e.company_id = cid and e.status = 'active'
    order by e.name
    limit 1000;
end $$;
revoke all on function public.payroll_people() from public, anon;
grant execute on function public.payroll_people() to authenticated;

-- Everything set for one person: the profile and the history of each pay item (newest first).
create function public.payroll_person(p_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not app.payroll_can('payroll.terms.view') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = cid) then
    raise exception 'payroll: not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(pr) - 'company_id' - 'updated_at' from public.employee_pay_profiles pr where pr.company_id = cid and pr.employee_id = p_employee_id),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'pay_item_id', t.pay_item_id, 'code', i.code, 'name', i.name, 'name_local', i.name_local,
        'category', i.category, 'amount', t.amount, 'rate_pct', t.rate_pct, 'currency_code', t.currency_code,
        'effective_from', t.effective_from, 'effective_to', t.effective_to, 'note', t.note) order by i.position, t.effective_from desc)
      from public.employee_pay_terms t join public.pay_items i on i.company_id = t.company_id and i.id = t.pay_item_id
      where t.company_id = cid and t.employee_id = p_employee_id), '[]'::jsonb));
end $$;
revoke all on function public.payroll_person(uuid) from public, anon;
grant execute on function public.payroll_person(uuid) to authenticated;

-- Set a reference value. The old row is closed the day before, so history is kept. Needs a new effective date after the current one.
create function public.payroll_save_terms(p_employee_id uuid, p_pay_item_id uuid, p_amount numeric, p_rate_pct numeric, p_currency text,
                                          p_effective_from date, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  cur public.employee_pay_terms%rowtype;
  new_id uuid;
begin
  if not app.payroll_can('payroll.terms.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = cid)
     or not exists (select 1 from public.pay_items where id = p_pay_item_id and company_id = cid and active) then
    raise exception 'payroll: not found' using errcode = 'P0002';
  end if;
  if (p_amount is null and p_rate_pct is null) or p_amount < 0 or p_rate_pct < 0 or p_rate_pct > 100 or p_effective_from is null
     or p_effective_from > current_date + 366
     or not exists (select 1 from public.company_currencies where company_id = cid and code = upper(coalesce(p_currency, ''))) then
    raise exception 'payroll: terms' using errcode = 'P0001';
  end if;
  select * into cur from public.employee_pay_terms
    where company_id = cid and employee_id = p_employee_id and pay_item_id = p_pay_item_id and effective_to is null for update;
  if found then
    if p_effective_from <= cur.effective_from then raise exception 'payroll: date' using errcode = 'P0001'; end if;
    update public.employee_pay_terms set effective_to = p_effective_from - 1 where id = cur.id;
  end if;
  insert into public.employee_pay_terms (company_id, employee_id, pay_item_id, amount, rate_pct, currency_code, effective_from, note, created_by)
  values (cid, p_employee_id, p_pay_item_id, round(p_amount, 2), p_rate_pct, upper(p_currency), p_effective_from,
          nullif(btrim(coalesce(p_note, '')), ''), app.membership_id()) returning id into new_id;
  perform app.payroll_event(p_employee_id, 'terms.set', jsonb_build_object('pay_item_id', p_pay_item_id, 'amount', p_amount, 'rate_pct', p_rate_pct,
    'currency', upper(p_currency), 'effective_from', p_effective_from, 'previous_amount', cur.amount, 'previous_rate_pct', cur.rate_pct));
  return new_id;
end $$;
revoke all on function public.payroll_save_terms(uuid, uuid, numeric, numeric, text, date, text) from public, anon;
grant execute on function public.payroll_save_terms(uuid, uuid, numeric, numeric, text, date, text) to authenticated;

create function public.payroll_save_profile(p_employee_id uuid, p_currency text, p_method text, p_account_name text, p_account_no text,
                                            p_bank_name text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not app.payroll_can('payroll.terms.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = cid) then
    raise exception 'payroll: not found' using errcode = 'P0002';
  end if;
  if p_method not in ('cash', 'bank', 'wing', 'aba', 'other')
     or not exists (select 1 from public.company_currencies where company_id = cid and code = upper(coalesce(p_currency, ''))) then
    raise exception 'payroll: profile' using errcode = 'P0001';
  end if;
  insert into public.employee_pay_profiles (company_id, employee_id, pay_currency, payment_method, account_name, account_no, bank_name, note)
  values (cid, p_employee_id, upper(p_currency), p_method, nullif(btrim(coalesce(p_account_name, '')), ''), nullif(btrim(coalesce(p_account_no, '')), ''),
          nullif(btrim(coalesce(p_bank_name, '')), ''), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (company_id, employee_id) do update set pay_currency = excluded.pay_currency, payment_method = excluded.payment_method,
    account_name = excluded.account_name, account_no = excluded.account_no, bank_name = excluded.bank_name, note = excluded.note;
  perform app.payroll_event(p_employee_id, 'profile.set', jsonb_build_object('currency', upper(p_currency), 'method', p_method));
end $$;
revoke all on function public.payroll_save_profile(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.payroll_save_profile(uuid, text, text, text, text, text, text) to authenticated;

create function public.payroll_get_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.payroll_can('payroll.terms.view') or app.payroll_can('payroll.settings.manage')) then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select to_jsonb(s) - 'company_id' - 'updated_at' from public.payroll_settings s where s.company_id = app.company_id()),
                  jsonb_build_object('rate_divisor', '26', 'overtime_multiplier', 1.5, 'require_second_approver', false, 'close_blocks_on_review', true));
end $$;
revoke all on function public.payroll_get_settings() from public, anon;
grant execute on function public.payroll_get_settings() to authenticated;

create function public.payroll_save_settings(p_rate_divisor text, p_overtime_multiplier numeric, p_require_second_approver boolean,
                                             p_close_blocks_on_review boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.payroll_can('payroll.settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_rate_divisor not in ('26', '30', 'scheduled') or p_overtime_multiplier is null or p_overtime_multiplier < 1 or p_overtime_multiplier > 5 then
    raise exception 'payroll: settings' using errcode = 'P0001';
  end if;
  insert into public.payroll_settings (company_id, rate_divisor, overtime_multiplier, require_second_approver, close_blocks_on_review)
  values (app.company_id(), p_rate_divisor, p_overtime_multiplier, coalesce(p_require_second_approver, false), coalesce(p_close_blocks_on_review, true))
  on conflict (company_id) do update set rate_divisor = excluded.rate_divisor, overtime_multiplier = excluded.overtime_multiplier,
    require_second_approver = excluded.require_second_approver, close_blocks_on_review = excluded.close_blocks_on_review;
  perform app.payroll_event(null, 'settings.set', jsonb_build_object('rate_divisor', p_rate_divisor, 'overtime_multiplier', p_overtime_multiplier,
    'require_second_approver', p_require_second_approver, 'close_blocks_on_review', p_close_blocks_on_review));
end $$;
revoke all on function public.payroll_save_settings(text, numeric, boolean, boolean) from public, anon;
grant execute on function public.payroll_save_settings(text, numeric, boolean, boolean) to authenticated;
