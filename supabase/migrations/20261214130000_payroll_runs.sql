-- UPLIF Time, slice T4: pay plans, rules, pay runs and draft payslips.
-- A pay plan (fixed, achievement, commission, bonus) opens a pay run on its own day. Opening a run only creates DRAFT payslips
-- pre-filled from the reference pay terms (and, for achievement and commission, from the company rule). Nothing is posted or paid.
-- Same secrecy as T3: tables are readable only at company scope, every write is a function, the audit log never holds amounts.
-- Posting, closing and paying come in later slices (T5, T6).

create table public.pay_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('fixed', 'achievement', 'commission', 'bonus')),
  name text not null check (length(btrim(name)) between 1 and 80),
  name_local text check (name_local is null or length(name_local) <= 80),
  open_day integer check (open_day is null or open_day between 1 and 28),
  covers text not null default 'calendar_month' check (covers in ('cutoff', 'calendar_month')),
  auto_open boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, kind),
  check ((kind = 'bonus') = (open_day is null))
);

create table public.pay_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null,
  kind text not null check (kind in ('kpi_bands', 'sales_rate', 'sales_tiers')),
  config jsonb not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  check (effective_to is null or effective_to >= effective_from),
  foreign key (company_id, plan_id) references public.pay_plans (company_id, id) on delete cascade
);
create unique index pay_rules_current_idx on public.pay_rules (company_id, plan_id) where effective_to is null;

create table public.sales_volumes (
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  source text not null default 'typed' check (source in ('typed', 'import', 'go', 'orders')),
  updated_at timestamptz not null default now(),
  primary key (company_id, employee_id, month),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);

create table public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  period_start date not null,
  period_end date not null,
  open_date date not null,
  pay_date date,
  status text not null default 'open' check (status in ('scheduled', 'open', 'closed', 'paid', 'locked')),
  closed_by uuid,
  closed_at timestamptz,
  paid_at timestamptz,
  reopened_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (company_id, id),
  unique (company_id, plan_id, period_start),
  foreign key (company_id, plan_id) references public.pay_plans (company_id, id)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid not null,
  employee_id uuid not null,
  version integer not null default 1,
  is_current boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'posted', 'confirmed', 'review_requested', 'superseded')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  rate_home numeric(18,8),
  gross numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  posted_by uuid,
  posted_at timestamptz,
  confirmed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, run_id) references public.pay_runs (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create unique index payslips_current_idx on public.payslips (company_id, run_id, employee_id) where is_current;
create index payslips_employee_idx on public.payslips (company_id, employee_id);

create table public.payslip_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payslip_id uuid not null,
  pay_item_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  label_local text check (label_local is null or length(label_local) <= 120),
  kind text not null check (kind in ('earning', 'deduction')),
  qty numeric(10,2) not null default 1 check (qty >= 0),
  unit_amount numeric(14,2) not null check (unit_amount >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  source text not null default 'manual' check (source in ('manual', 'suggested', 'attendance', 'leave', 'reference', 'rule', 'override')),
  source_ref text,
  note text check (note is null or length(note) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, payslip_id) references public.payslips (company_id, id) on delete cascade,
  foreign key (company_id, pay_item_id) references public.pay_items (company_id, id)
);
create index payslip_lines_payslip_idx on public.payslip_lines (company_id, payslip_id);

create trigger touch_pay_plans before update on public.pay_plans for each row execute function app.touch_updated_at();
create trigger touch_pay_runs before update on public.pay_runs for each row execute function app.touch_updated_at();
create trigger touch_payslips before update on public.payslips for each row execute function app.touch_updated_at();
create trigger touch_sales_volumes before update on public.sales_volumes for each row execute function app.touch_updated_at();
create trigger immutable_company_pay_plans before update on public.pay_plans for each row execute function app.forbid_company_change();
create trigger immutable_company_pay_rules before update on public.pay_rules for each row execute function app.forbid_company_change();
create trigger immutable_company_pay_runs before update on public.pay_runs for each row execute function app.forbid_company_change();
create trigger immutable_company_payslips before update on public.payslips for each row execute function app.forbid_company_change();
create trigger immutable_company_payslip_lines before update on public.payslip_lines for each row execute function app.forbid_company_change();
create trigger immutable_company_sales_volumes before update on public.sales_volumes for each row execute function app.forbid_company_change();

-- Audit says that something changed, never the amount (payslip_lines and amounts live in payroll_events).
create trigger audit_pay_plans after insert or update on public.pay_plans for each row execute function app.audit_payroll_row();
create trigger audit_pay_runs after insert or update on public.pay_runs for each row execute function app.audit_payroll_row();
create trigger audit_payslips after insert or update on public.payslips for each row execute function app.audit_payroll_row();
create trigger audit_sales_volumes after insert or update on public.sales_volumes for each row execute function app.audit_payroll_row();

-- ---------- RLS: read only at company scope, never write directly ----------
alter table public.pay_plans enable row level security;
alter table public.pay_plans force row level security;
alter table public.pay_rules enable row level security;
alter table public.pay_rules force row level security;
alter table public.sales_volumes enable row level security;
alter table public.sales_volumes force row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_runs force row level security;
alter table public.payslips enable row level security;
alter table public.payslips force row level security;
alter table public.payslip_lines enable row level security;
alter table public.payslip_lines force row level security;

create function app.payroll_can_prepare() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.payroll_can('payroll.payslip.view') or app.payroll_can('payroll.payslip.prepare')
$$;
revoke all on function app.payroll_can_prepare() from public, anon;
grant execute on function app.payroll_can_prepare() to authenticated;

create policy pay_plans_select on public.pay_plans for select to authenticated
  using (company_id = (select app.company_id()) and ((select app.payroll_can_prepare()) or (select app.payroll_can('payroll.settings.manage'))));
create policy pay_rules_select on public.pay_rules for select to authenticated
  using (company_id = (select app.company_id()) and ((select app.payroll_can_prepare()) or (select app.payroll_can('payroll.settings.manage'))));
create policy sales_volumes_select on public.sales_volumes for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can_prepare()));
create policy pay_runs_select on public.pay_runs for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can_prepare()));
create policy payslips_select on public.payslips for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can_prepare()));
create policy payslip_lines_select on public.payslip_lines for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can_prepare()));
grant select on public.pay_plans, public.pay_rules, public.sales_volumes, public.pay_runs, public.payslips, public.payslip_lines to authenticated;

-- Permission to prepare payslips: Owner, Admin already hold all payroll.% keys (T3). Nothing more to seed.

-- ---------- default plans for every company, now and later ----------
create function app.seed_pay_plans(p_company_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.pay_plans (company_id, kind, name, name_local, open_day, covers) values
    (p_company_id, 'fixed', 'Fixed salary', 'ប្រាក់ខែថេរ', 25, 'cutoff'),
    (p_company_id, 'achievement', 'Achievement salary', 'ប្រាក់ខែតាមសមិទ្ធផល', 5, 'calendar_month'),
    (p_company_id, 'commission', 'Commission', 'កម្រៃជើងសារ', 5, 'calendar_month'),
    (p_company_id, 'bonus', 'Bonus', 'ប្រាក់រង្វាន់', null, 'calendar_month')
  on conflict (company_id, kind) do nothing;
  -- Example rules (the company edits them): KPI bands and a flat commission rate.
  insert into public.pay_rules (company_id, plan_id, kind, config, effective_from)
  select p_company_id, p.id, 'kpi_bands',
         '{"bands":[{"min":0,"pct":0},{"min":60,"pct":50},{"min":80,"pct":100},{"min":95,"pct":120}]}'::jsonb, date '2000-01-01'
  from public.pay_plans p where p.company_id = p_company_id and p.kind = 'achievement'
    and not exists (select 1 from public.pay_rules r where r.company_id = p_company_id and r.plan_id = p.id);
  insert into public.pay_rules (company_id, plan_id, kind, config, effective_from)
  select p_company_id, p.id, 'sales_rate', '{"rate_pct":2}'::jsonb, date '2000-01-01'
  from public.pay_plans p where p.company_id = p_company_id and p.kind = 'commission'
    and not exists (select 1 from public.pay_rules r where r.company_id = p_company_id and r.plan_id = p.id);
$$;
revoke execute on function app.seed_pay_plans(uuid) from public, anon, authenticated;
select app.seed_pay_plans(id) from public.companies;
create function app.seed_pay_plans_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_pay_plans(new.id);
  return new;
end $$;
revoke all on function app.seed_pay_plans_trg() from public, anon, authenticated;
create trigger seed_pay_plans after insert on public.companies for each row execute function app.seed_pay_plans_trg();

-- ---------- internal helpers (explicit company, so the daily opener can use them without a signed-in person) ----------
create function app.payroll_event_for(p_company_id uuid, p_employee_id uuid, p_action text, p_detail jsonb, p_actor uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.payroll_events (company_id, employee_id, action, detail, actor_membership_id)
  values (p_company_id, p_employee_id, p_action, coalesce(p_detail, '{}'::jsonb), p_actor)
$$;
revoke all on function app.payroll_event_for(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;

create function app.payslip_totals(p_company_id uuid, p_payslip_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.payslips p set
    gross = coalesce((select sum(l.amount) from public.payslip_lines l where l.payslip_id = p.id and l.company_id = p.company_id and l.kind = 'earning'), 0),
    deductions = coalesce((select sum(l.amount) from public.payslip_lines l where l.payslip_id = p.id and l.company_id = p.company_id and l.kind = 'deduction'), 0),
    net = coalesce((select sum(case when l.kind = 'earning' then l.amount else -l.amount end) from public.payslip_lines l where l.payslip_id = p.id and l.company_id = p.company_id), 0)
  where p.id = p_payslip_id and p.company_id = p_company_id
$$;
revoke all on function app.payslip_totals(uuid, uuid) from public, anon, authenticated;

-- Rule result for achievement: share of the reference amount for a KPI score. Returns the percent and a plain explanation.
create function app.kpi_band(p_config jsonb, p_score numeric, out pct numeric, out explain text)
language plpgsql immutable set search_path = '' as $$
declare b jsonb; nxt numeric; bands jsonb := coalesce(p_config -> 'bands', '[]'::jsonb); i int; n int := jsonb_array_length(coalesce(p_config -> 'bands', '[]'::jsonb));
begin
  pct := 0; explain := 'No band';
  for i in 0 .. n - 1 loop
    b := bands -> i;
    if p_score >= (b ->> 'min')::numeric then
      pct := (b ->> 'pct')::numeric;
      nxt := case when i + 1 < n then (bands -> (i + 1) ->> 'min')::numeric - 1 else null end;
      explain := 'band ' || (b ->> 'min') || case when nxt is null then ' and over' else ' to ' || nxt end || ' = ' || (b ->> 'pct') || ' %';
    end if;
  end loop;
end $$;

-- Build or refresh one draft payslip: reference and rule lines are rebuilt, lines the admin typed or changed are kept.
create function app.build_payslip(p_company_id uuid, p_run_id uuid, p_employee_id uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  run public.pay_runs%rowtype;
  plan public.pay_plans%rowtype;
  emp public.employees%rowtype;
  slip public.payslips%rowtype;
  item public.pay_items%rowtype;
  term public.employee_pay_terms%rowtype;
  cfg jsonb;
  rule_kind text;
  amt numeric; pct numeric; ex text; score numeric; vol numeric; rate numeric;
  pos_name text; snap jsonb;
  d date; r record; wd int := 0; ab int := 0; lt int := 0; ot int := 0; lv int := 0;
  st text; on_leave boolean;
begin
  select * into run from public.pay_runs where id = p_run_id and company_id = p_company_id;
  select * into plan from public.pay_plans where id = run.plan_id and company_id = p_company_id;
  select * into emp from public.employees where id = p_employee_id and company_id = p_company_id;
  select * into item from public.pay_items where company_id = p_company_id and active
    and code = case plan.kind when 'fixed' then 'BASIC' when 'achievement' then 'ACHV' when 'commission' then 'COMM' else 'BONUS' end;
  select * into term from public.employee_pay_terms where company_id = p_company_id and employee_id = p_employee_id and pay_item_id = item.id and effective_to is null;
  if plan.kind <> 'bonus' and not found then return null; end if;

  select * into slip from public.payslips where company_id = p_company_id and run_id = p_run_id and employee_id = p_employee_id and is_current;
  if not found then
    insert into public.payslips (company_id, run_id, employee_id, currency_code)
    values (p_company_id, p_run_id, p_employee_id, coalesce(term.currency_code, (select code from public.company_currencies where company_id = p_company_id and is_home limit 1), 'USD'))
    returning * into slip;
  end if;
  if slip.status <> 'draft' then return slip.id; end if;

  select name into pos_name from public.positions where company_id = p_company_id and id = emp.position_id;
  if plan.kind = 'fixed' then
    for d in select generate_series(run.period_start, least(run.period_end, current_date), interval '1 day')::date loop
      select * into r from app.attendance_day(p_employee_id, d);
      on_leave := exists (select 1 from public.leave_requests lr where lr.company_id = p_company_id and lr.employee_id = p_employee_id
                          and lr.status = 'approved' and d between lr.start_date and lr.end_date);
      st := case when r.status in ('absent', 'future', 'pending') and on_leave then 'leave' else r.status end;
      if st in ('on_time', 'late', 'early_leave', 'incomplete', 'absent', 'in_progress') then wd := wd + 1; end if;
      if st = 'absent' then ab := ab + 1; end if;
      if st = 'leave' then lv := lv + 1; end if;
      lt := lt + coalesce(r.late_min, 0); ot := ot + coalesce(r.overtime_min, 0);
    end loop;
  end if;
  snap := jsonb_build_object('employee_name', emp.name, 'employee_name_local', emp.name_local, 'position', pos_name, 'branch_id', emp.branch_id,
    'plan', plan.name, 'period_start', run.period_start, 'period_end', run.period_end,
    'work_days', wd, 'absent_days', ab, 'late_min', lt, 'overtime_min', ot, 'leave_days', lv);
  update public.payslips set snapshot = snap where id = slip.id;

  delete from public.payslip_lines where company_id = p_company_id and payslip_id = slip.id and source in ('reference', 'rule');
  -- A line the admin overrode stays; the rule or reference line for the same pay item is not added back next to it.
  if exists (select 1 from public.payslip_lines where company_id = p_company_id and payslip_id = slip.id and pay_item_id = item.id and source = 'override') then
    perform app.payslip_totals(p_company_id, slip.id);
    return slip.id;
  end if;

  if plan.kind = 'fixed' then
    insert into public.payslip_lines (company_id, payslip_id, pay_item_id, label, label_local, kind, qty, unit_amount, amount, source, position)
    values (p_company_id, slip.id, item.id, item.name, item.name_local, 'earning', 1, term.amount, term.amount, 'reference', 1);
  elsif plan.kind = 'achievement' then
    select r2.config into cfg from public.pay_rules r2 where r2.company_id = p_company_id and r2.plan_id = plan.id and r2.kind = 'kpi_bands'
      and r2.effective_from <= run.period_end and (r2.effective_to is null or r2.effective_to >= run.period_start) order by r2.effective_from desc limit 1;
    select overall_percent into score from public.performance_reviews where company_id = p_company_id and employee_id = p_employee_id and period = date_trunc('month', run.period_start)::date;
    if score is null then pct := 0; ex := 'Rule: no KPI score for this month';
    else select k.pct, 'Rule: KPI ' || score || ' %, ' || k.explain into pct, ex from app.kpi_band(cfg, score) k; end if;
    amt := round(coalesce(term.amount, 0) * coalesce(pct, 0) / 100, 2);
    insert into public.payslip_lines (company_id, payslip_id, pay_item_id, label, label_local, kind, qty, unit_amount, amount, source, source_ref, note, position)
    values (p_company_id, slip.id, item.id, item.name, item.name_local, 'earning', 1, amt, amt, 'rule', amt::text, ex, 1);
  elsif plan.kind = 'commission' then
    select coalesce(v.amount, 0) into vol from (select 1) x left join public.sales_volumes v
      on v.company_id = p_company_id and v.employee_id = p_employee_id and v.month = date_trunc('month', run.period_start)::date;
    select r2.kind, r2.config into rule_kind, cfg from public.pay_rules r2 where r2.company_id = p_company_id and r2.plan_id = plan.id
      and r2.effective_from <= run.period_end and (r2.effective_to is null or r2.effective_to >= run.period_start) order by r2.effective_from desc limit 1;
    if rule_kind = 'sales_tiers' then
      select t ->> 'rate_pct' into ex from jsonb_array_elements(coalesce(cfg -> 'tiers', '[]'::jsonb)) t
        where vol >= (t ->> 'from')::numeric order by (t ->> 'from')::numeric desc limit 1;
      rate := coalesce(ex::numeric, 0);
    else
      rate := coalesce(term.rate_pct, (cfg ->> 'rate_pct')::numeric, 0);
    end if;
    amt := round(vol * rate / 100, 2);
    insert into public.payslip_lines (company_id, payslip_id, pay_item_id, label, label_local, kind, qty, unit_amount, amount, source, source_ref, note, position)
    values (p_company_id, slip.id, item.id, item.name, item.name_local, 'earning', 1, amt, amt, 'rule', amt::text,
            'Rule: sales ' || vol || ' x ' || rate || ' %' || case when not exists (select 1 from public.sales_volumes v where v.company_id = p_company_id and v.employee_id = p_employee_id and v.month = date_trunc('month', run.period_start)::date) then ' (no sales volume entered)' else '' end, 1);
  end if;
  perform app.payslip_totals(p_company_id, slip.id);
  return slip.id;
end $$;
revoke all on function app.build_payslip(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Create a run for a plan and month and build its drafts. Idempotent: an existing run is refreshed, not duplicated.
-- p_month is the first day of the month the run is FOR (fixed: the 25th of that month closes the period; achievement and
-- commission: the whole of that month, opened on the open day of the next month). For a bonus run p_month is the pay month.
create function app.open_run(p_company_id uuid, p_plan_id uuid, p_month date, p_name text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  plan public.pay_plans%rowtype;
  m date := date_trunc('month', p_month)::date;
  ps date; pe date; od date; rid uuid; nm text; emp record;
begin
  select * into plan from public.pay_plans where id = p_plan_id and company_id = p_company_id and active;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if plan.kind = 'fixed' then
    pe := m + (plan.open_day - 1);
    ps := case when plan.covers = 'cutoff' then ((m - interval '1 month')::date + plan.open_day) else m end;
    if plan.covers <> 'cutoff' then pe := (m + interval '1 month')::date - 1; end if;
    od := m + (plan.open_day - 1);
  elsif plan.kind = 'bonus' then
    ps := m; pe := (m + interval '1 month')::date - 1; od := current_date;
  else
    ps := m; pe := (m + interval '1 month')::date - 1; od := (m + interval '1 month')::date + (plan.open_day - 1);
  end if;
  nm := coalesce(nullif(btrim(coalesce(p_name, '')), ''), plan.name || ', ' || to_char(m, 'FMMonth YYYY'));
  select id into rid from public.pay_runs where company_id = p_company_id and plan_id = plan.id and period_start = ps;
  if rid is null then
    insert into public.pay_runs (company_id, plan_id, name, period_start, period_end, open_date, status, created_by)
    values (p_company_id, plan.id, nm, ps, pe, od, 'open', p_actor) returning id into rid;
    perform app.payroll_event_for(p_company_id, null, 'run.open', jsonb_build_object('run_id', rid, 'plan', plan.name, 'name', nm), p_actor);
  elsif (select status from public.pay_runs where id = rid) <> 'open' then
    raise exception 'payroll: status' using errcode = 'P0001';
  end if;
  if plan.kind <> 'bonus' then
    for emp in select id from public.employees where company_id = p_company_id and status = 'active' order by id loop
      perform app.build_payslip(p_company_id, rid, emp.id, p_actor);
    end loop;
  end if;
  return rid;
end $$;
revoke all on function app.open_run(uuid, uuid, date, text, uuid) from public, anon, authenticated;

-- Daily opener: for every company with Attendance, open each active auto plan once its open day has come.
create function app.run_pay_openers() returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; p record; m date; n integer := 0; od date;
begin
  for c in select id from public.companies where deleted_at is null loop
    if not app.module_enabled(c.id, 'attendance') then continue; end if;
    for p in select * from public.pay_plans where company_id = c.id and active and auto_open and open_day is not null loop
      if p.kind = 'fixed' then
        m := date_trunc('month', current_date)::date; od := m + (p.open_day - 1);
      else
        m := (date_trunc('month', current_date) - interval '1 month')::date; od := (m + interval '1 month')::date + (p.open_day - 1);
      end if;
      if current_date >= od and not exists (
        select 1 from public.pay_runs r where r.company_id = c.id and r.plan_id = p.id
          and r.period_start = case when p.kind = 'fixed' and p.covers = 'cutoff' then ((m - interval '1 month')::date + p.open_day) else m end) then
        perform app.open_run(c.id, p.id, m, null, null);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function app.run_pay_openers() from public, anon, authenticated;
do $$
begin
  begin create extension if not exists pg_cron; exception when others then
    raise notice 'pg_cron is not available; schedule the daily run by hand: select app.run_pay_openers()';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('uplif-daily-pay-openers', '30 1 * * *', 'select app.run_pay_openers()');
  end if;
end $$;

-- ---------- functions for the app ----------
create function public.payroll_plans()
returns table (id uuid, kind text, name text, name_local text, open_day integer, covers text, auto_open boolean, active boolean,
               rule_kind text, rule_config jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.payroll_can_prepare() or app.payroll_can('payroll.settings.manage')) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.kind, p.name, p.name_local, p.open_day, p.covers, p.auto_open, p.active, r.kind, r.config
    from public.pay_plans p
    left join public.pay_rules r on r.company_id = p.company_id and r.plan_id = p.id and r.effective_to is null
    where p.company_id = app.company_id()
    order by array_position(array['fixed', 'achievement', 'commission', 'bonus'], p.kind);
end $$;
revoke all on function public.payroll_plans() from public, anon;
grant execute on function public.payroll_plans() to authenticated;

create function public.payroll_save_plan(p_plan_id uuid, p_open_day integer, p_covers text, p_auto_open boolean, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare plan public.pay_plans%rowtype;
begin
  if not app.payroll_can('payroll.settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into plan from public.pay_plans where id = p_plan_id and company_id = app.company_id();
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if p_covers not in ('cutoff', 'calendar_month') or (plan.kind <> 'fixed' and p_covers = 'cutoff')
     or (plan.kind = 'bonus' and p_open_day is not null) or (plan.kind <> 'bonus' and (p_open_day is null or p_open_day not between 1 and 28)) then
    raise exception 'payroll: plan' using errcode = 'P0001';
  end if;
  update public.pay_plans set open_day = p_open_day, covers = p_covers, auto_open = coalesce(p_auto_open, true), active = coalesce(p_active, true) where id = plan.id;
  perform app.payroll_event(null, 'plan.set', jsonb_build_object('plan', plan.name, 'open_day', p_open_day, 'covers', p_covers, 'auto_open', p_auto_open, 'active', p_active));
end $$;
revoke all on function public.payroll_save_plan(uuid, integer, text, boolean, boolean) from public, anon;
grant execute on function public.payroll_save_plan(uuid, integer, text, boolean, boolean) to authenticated;

-- A new rule starts on p_from and closes the one in force the day before. Config is checked here.
create function public.payroll_save_rule(p_plan_id uuid, p_kind text, p_config jsonb, p_from date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id(); plan public.pay_plans%rowtype; cur public.pay_rules%rowtype; ok boolean := true; x jsonb; last_min numeric := -1; last_from numeric := -1;
begin
  if not app.payroll_can('payroll.settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into plan from public.pay_plans where id = p_plan_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if p_from is null or p_from > current_date + 366 or p_config is null or jsonb_typeof(p_config) <> 'object'
     or not ((plan.kind = 'achievement' and p_kind = 'kpi_bands') or (plan.kind = 'commission' and p_kind in ('sales_rate', 'sales_tiers'))) then
    raise exception 'payroll: rule' using errcode = 'P0001';
  end if;
  if p_kind = 'kpi_bands' then
    if jsonb_typeof(p_config -> 'bands') <> 'array' or jsonb_array_length(p_config -> 'bands') not between 1 and 12 then ok := false; end if;
    if ok then
      for x in select * from jsonb_array_elements(p_config -> 'bands') loop
        if jsonb_typeof(x -> 'min') <> 'number' or jsonb_typeof(x -> 'pct') <> 'number' or (x ->> 'min')::numeric not between 0 and 100
           or (x ->> 'pct')::numeric not between 0 and 300 or (x ->> 'min')::numeric <= last_min then ok := false; exit; end if;
        last_min := (x ->> 'min')::numeric;
      end loop;
    end if;
  elsif p_kind = 'sales_rate' then
    ok := jsonb_typeof(p_config -> 'rate_pct') = 'number' and (p_config ->> 'rate_pct')::numeric between 0 and 100;
  else
    if jsonb_typeof(p_config -> 'tiers') <> 'array' or jsonb_array_length(p_config -> 'tiers') not between 1 and 12 then ok := false; end if;
    if ok then
      for x in select * from jsonb_array_elements(p_config -> 'tiers') loop
        if jsonb_typeof(x -> 'from') <> 'number' or jsonb_typeof(x -> 'rate_pct') <> 'number' or (x ->> 'from')::numeric < 0
           or (x ->> 'rate_pct')::numeric not between 0 and 100 or (x ->> 'from')::numeric <= last_from then ok := false; exit; end if;
        last_from := (x ->> 'from')::numeric;
      end loop;
    end if;
  end if;
  if not ok then raise exception 'payroll: rule' using errcode = 'P0001'; end if;
  select * into cur from public.pay_rules where company_id = cid and plan_id = plan.id and effective_to is null for update;
  if found then
    if p_from <= cur.effective_from then raise exception 'payroll: date' using errcode = 'P0001'; end if;
    update public.pay_rules set effective_to = p_from - 1 where id = cur.id;
  end if;
  insert into public.pay_rules (company_id, plan_id, kind, config, effective_from) values (cid, plan.id, p_kind, p_config, p_from);
  perform app.payroll_event(null, 'rule.set', jsonb_build_object('plan', plan.name, 'kind', p_kind, 'config', p_config, 'effective_from', p_from));
end $$;
revoke all on function public.payroll_save_rule(uuid, text, jsonb, date) from public, anon;
grant execute on function public.payroll_save_rule(uuid, text, jsonb, date) to authenticated;

create function public.payroll_set_sales_volume(p_employee_id uuid, p_month date, p_amount numeric, p_currency text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); m date := date_trunc('month', p_month)::date;
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = cid) then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount < 0 or p_month is null or m > current_date
     or not exists (select 1 from public.company_currencies where company_id = cid and code = upper(coalesce(p_currency, ''))) then
    raise exception 'payroll: terms' using errcode = 'P0001';
  end if;
  insert into public.sales_volumes (company_id, employee_id, month, amount, currency_code) values (cid, p_employee_id, m, round(p_amount, 2), upper(p_currency))
  on conflict (company_id, employee_id, month) do update set amount = excluded.amount, currency_code = excluded.currency_code, source = 'typed';
  perform app.payroll_event(p_employee_id, 'sales.set', jsonb_build_object('month', m, 'amount', p_amount));
end $$;
revoke all on function public.payroll_set_sales_volume(uuid, date, numeric, text) from public, anon;
grant execute on function public.payroll_set_sales_volume(uuid, date, numeric, text) to authenticated;

create function public.payroll_runs()
returns table (id uuid, plan_id uuid, plan_kind text, name text, period_start date, period_end date, open_date date, status text,
               slips integer, drafts integer, currency_code text, net numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, r.plan_id, p.kind, r.name, r.period_start, r.period_end, r.open_date, r.status,
           (count(s.id))::int, (count(s.id) filter (where s.status = 'draft'))::int,
           min(s.currency_code), coalesce(sum(s.net), 0)
    from public.pay_runs r
    join public.pay_plans p on p.company_id = r.company_id and p.id = r.plan_id
    left join public.payslips s on s.company_id = r.company_id and s.run_id = r.id and s.is_current
    where r.company_id = app.company_id()
    group by r.id, p.kind
    order by r.period_start desc, r.created_at desc
    limit 100;
end $$;
revoke all on function public.payroll_runs() from public, anon;
grant execute on function public.payroll_runs() to authenticated;

create function public.payroll_open_run(p_plan_id uuid, p_month date, p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not app.payroll_can('payroll.run.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_month is null or p_month > current_date + 62 then raise exception 'payroll: date' using errcode = 'P0001'; end if;
  return app.open_run(app.company_id(), p_plan_id, p_month, p_name, app.membership_id());
end $$;
revoke all on function public.payroll_open_run(uuid, date, text) from public, anon;
grant execute on function public.payroll_open_run(uuid, date, text) to authenticated;

-- Rebuild the reference and rule lines of every draft in an open run (lines the admin typed or changed are kept).
create function public.payroll_refresh_run(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); run public.pay_runs%rowtype; e record;
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into run from public.pay_runs where id = p_run_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if run.status <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if (select kind from public.pay_plans where id = run.plan_id and company_id = cid) <> 'bonus' then
    for e in select id from public.employees where company_id = cid and status = 'active' order by id loop
      perform app.build_payslip(cid, run.id, e.id, app.membership_id());
    end loop;
  end if;
  perform app.payroll_event(null, 'run.refresh', jsonb_build_object('run_id', run.id));
end $$;
revoke all on function public.payroll_refresh_run(uuid) from public, anon;
grant execute on function public.payroll_refresh_run(uuid) to authenticated;

create function public.payroll_run_slips(p_run_id uuid)
returns table (payslip_id uuid, employee_id uuid, name text, name_local text, status text, currency_code text, gross numeric, deductions numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.pay_runs where id = p_run_id and company_id = app.company_id()) then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  return query
    select s.id, s.employee_id, e.name, e.name_local, s.status, s.currency_code, s.gross, s.deductions, s.net
    from public.payslips s join public.employees e on e.company_id = s.company_id and e.id = s.employee_id
    where s.company_id = app.company_id() and s.run_id = p_run_id and s.is_current
    order by e.name limit 1000;
end $$;
revoke all on function public.payroll_run_slips(uuid) from public, anon;
grant execute on function public.payroll_run_slips(uuid) to authenticated;

create function public.payroll_payslip(p_payslip_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); s public.payslips%rowtype;
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', s.id, 'run_id', s.run_id, 'employee_id', s.employee_id, 'status', s.status, 'currency_code', s.currency_code,
    'gross', s.gross, 'deductions', s.deductions, 'net', s.net, 'snapshot', s.snapshot,
    'run_status', (select status from public.pay_runs where id = s.run_id and company_id = cid),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'pay_item_id', l.pay_item_id, 'label', l.label, 'label_local', l.label_local, 'kind', l.kind,
        'qty', l.qty, 'unit_amount', l.unit_amount, 'amount', l.amount, 'source', l.source, 'source_ref', l.source_ref, 'note', l.note) order by l.kind desc, l.position, l.created_at)
      from public.payslip_lines l where l.company_id = cid and l.payslip_id = s.id), '[]'::jsonb));
end $$;
revoke all on function public.payroll_payslip(uuid) from public, anon;
grant execute on function public.payroll_payslip(uuid) to authenticated;

-- Add or change a line on a DRAFT payslip. Changing a reference or rule line needs a reason and keeps the rule's result next to it.
create function public.payroll_save_line(p_payslip_id uuid, p_line_id uuid, p_pay_item_id uuid, p_qty numeric, p_unit_amount numeric, p_note text, p_source text default 'manual') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id(); s public.payslips%rowtype; item public.pay_items%rowtype; old public.payslip_lines%rowtype;
  q numeric := coalesce(p_qty, 1); a numeric; src text := case when p_source = 'suggested' then 'suggested' else 'manual' end; lid uuid; n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if s.status <> 'draft' or (select status from public.pay_runs where id = s.run_id and company_id = cid) <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  select * into item from public.pay_items where id = p_pay_item_id and company_id = cid and active;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if q < 0 or p_unit_amount is null or p_unit_amount < 0 or q > 100000 then raise exception 'payroll: line' using errcode = 'P0001'; end if;
  a := round(q * p_unit_amount, 2);
  if p_line_id is null then
    insert into public.payslip_lines (company_id, payslip_id, pay_item_id, label, label_local, kind, qty, unit_amount, amount, source, note, position)
    values (cid, s.id, item.id, item.name, item.name_local, item.kind, q, p_unit_amount, a, src, n,
            coalesce((select max(position) from public.payslip_lines where company_id = cid and payslip_id = s.id), 0) + 1) returning id into lid;
  else
    select * into old from public.payslip_lines where id = p_line_id and company_id = cid and payslip_id = s.id;
    if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
    if old.source in ('reference', 'rule') and a <> old.amount and n is null then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
    update public.payslip_lines set qty = q, unit_amount = p_unit_amount, amount = a, note = coalesce(n, note),
      source = case when old.source in ('reference', 'rule') and a <> old.amount then 'override' else old.source end,
      source_ref = case when old.source in ('reference', 'rule') and a <> old.amount then coalesce(old.source_ref, old.amount::text) else old.source_ref end
    where id = old.id returning id into lid;
  end if;
  perform app.payslip_totals(cid, s.id);
  perform app.payroll_event(s.employee_id, 'line.save', jsonb_build_object('payslip_id', s.id, 'line_id', lid, 'pay_item', item.code, 'amount', a, 'note', n));
  return lid;
end $$;
revoke all on function public.payroll_save_line(uuid, uuid, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.payroll_save_line(uuid, uuid, uuid, numeric, numeric, text, text) to authenticated;

create function public.payroll_delete_line(p_line_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); l public.payslip_lines%rowtype; s public.payslips%rowtype;
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into l from public.payslip_lines where id = p_line_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  select * into s from public.payslips where id = l.payslip_id and company_id = cid;
  if s.status <> 'draft' or (select status from public.pay_runs where id = s.run_id and company_id = cid) <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  delete from public.payslip_lines where id = l.id;
  perform app.payslip_totals(cid, s.id);
  perform app.payroll_event(s.employee_id, 'line.delete', jsonb_build_object('payslip_id', s.id, 'label', l.label, 'amount', l.amount));
end $$;
revoke all on function public.payroll_delete_line(uuid) from public, anon;
grant execute on function public.payroll_delete_line(uuid) to authenticated;

-- Suggestions for a fixed-salary draft: shown, never applied. Each is one tap to add as a line.
create function public.payroll_suggestions(p_payslip_id uuid)
returns table (code text, pay_item_id uuid, label text, qty numeric, unit_amount numeric, amount numeric, note text)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id(); s public.payslips%rowtype; run public.pay_runs%rowtype; st public.payroll_settings%rowtype;
  basic numeric; div numeric; daily numeric; hourly numeric; ab numeric; ot numeric; unpaid numeric; wd numeric;
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  select * into run from public.pay_runs where id = s.run_id and company_id = cid;
  if (select kind from public.pay_plans where id = run.plan_id and company_id = cid) <> 'fixed' or s.status <> 'draft' then return; end if;
  select * into st from public.payroll_settings where company_id = cid;
  select t.amount into basic from public.employee_pay_terms t join public.pay_items i on i.company_id = t.company_id and i.id = t.pay_item_id
    where t.company_id = cid and t.employee_id = s.employee_id and t.effective_to is null and i.code = 'BASIC';
  wd := coalesce((s.snapshot ->> 'work_days')::numeric, 0);
  div := case coalesce(st.rate_divisor, '26') when '30' then 30 when 'scheduled' then greatest(wd, 1) else 26 end;
  daily := coalesce(basic, 0) / div; hourly := daily / 8;
  ab := coalesce((s.snapshot ->> 'absent_days')::numeric, 0);
  ot := coalesce((s.snapshot ->> 'overtime_min')::numeric, 0) / 60;
  select coalesce(sum(lr.days), 0) into unpaid from public.leave_requests lr join public.leave_types lt on lt.company_id = lr.company_id and lt.id = lr.type_id
    where lr.company_id = cid and lr.employee_id = s.employee_id and lr.status = 'approved' and not lt.paid
      and lr.start_date between run.period_start and run.period_end;
  if ab > 0 then
    return query select 'ABSENT', i.id, i.name, ab, round(daily, 2), round(ab * daily, 2), 'Absent ' || ab || ' day(s), daily rate ' || round(daily, 2)
      from public.pay_items i where i.company_id = cid and i.code = 'ABSENT' and i.active;
  end if;
  if unpaid > 0 then
    return query select 'UNPAID', i.id, i.name, unpaid, round(daily, 2), round(unpaid * daily, 2), 'Unpaid leave ' || unpaid || ' day(s)'
      from public.pay_items i where i.company_id = cid and i.code = 'UNPAID' and i.active;
  end if;
  if ot > 0 then
    return query select 'OT', i.id, i.name, round(ot, 2), round(hourly * st.overtime_multiplier, 2), round(ot * hourly * st.overtime_multiplier, 2),
      'Overtime ' || round(ot, 2) || ' h at ' || st.overtime_multiplier || ' x (8 h day)'
      from public.pay_items i where i.company_id = cid and i.code = 'OT' and i.active;
  end if;
end $$;
revoke all on function public.payroll_suggestions(uuid) from public, anon;
grant execute on function public.payroll_suggestions(uuid) to authenticated;

-- Bonus: no schedule and nothing computed. The admin names the run, adds people and amounts.
create function public.payroll_add_bonus(p_run_id uuid, p_employee_id uuid, p_amount numeric, p_currency text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); run public.pay_runs%rowtype; sid uuid; item_id uuid;
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into run from public.pay_runs where id = p_run_id and company_id = cid;
  if not found or not exists (select 1 from public.employees where id = p_employee_id and company_id = cid)
     or (select kind from public.pay_plans where id = run.plan_id and company_id = cid) <> 'bonus' then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if run.status <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 or not exists (select 1 from public.company_currencies where company_id = cid and code = upper(coalesce(p_currency, ''))) then
    raise exception 'payroll: line' using errcode = 'P0001';
  end if;
  select id into item_id from public.pay_items where company_id = cid and code = 'BONUS' and active;
  select id into sid from public.payslips where company_id = cid and run_id = run.id and employee_id = p_employee_id and is_current;
  if sid is null then
    insert into public.payslips (company_id, run_id, employee_id, currency_code, snapshot)
    select cid, run.id, e.id, upper(p_currency), jsonb_build_object('employee_name', e.name, 'employee_name_local', e.name_local, 'plan', run.name,
      'position', (select name from public.positions where company_id = cid and id = e.position_id), 'branch_id', e.branch_id)
    from public.employees e where e.id = p_employee_id and e.company_id = cid returning id into sid;
  elsif (select currency_code from public.payslips where id = sid) <> upper(p_currency) then
    raise exception 'payroll: line' using errcode = 'P0001';
  end if;
  perform public.payroll_save_line(sid, null, item_id, 1, p_amount, p_note, 'manual');
  return sid;
end $$;
revoke all on function public.payroll_add_bonus(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.payroll_add_bonus(uuid, uuid, numeric, text, text) to authenticated;
