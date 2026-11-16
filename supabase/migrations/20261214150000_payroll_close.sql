-- T6: close a pay run, payroll report, mark paid, lock, reopen with a reason, export log.
-- Closed runs take no payslip changes (every edit function already requires an open run).

create table public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid not null,
  kind text not null check (kind in ('csv', 'print')),
  row_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (company_id, run_id) references public.pay_runs (company_id, id)
);
create index payroll_exports_run_idx on public.payroll_exports (company_id, run_id);
alter table public.payroll_exports enable row level security;
alter table public.payroll_exports force row level security;
create policy payroll_exports_select on public.payroll_exports for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can('payroll.report.export')));
grant select on public.payroll_exports to authenticated;
create trigger audit_payroll_exports after insert on public.payroll_exports for each row execute function app.audit_payroll_row();

-- Close: every current payslip is posted (or confirmed); an open review blocks it unless the company allows it.
create function public.payroll_close(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); r public.pay_runs%rowtype; st public.payroll_settings%rowtype;
begin
  if not app.payroll_can('payroll.run.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.pay_runs where id = p_run_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  select * into st from public.payroll_settings where company_id = cid;
  if not exists (select 1 from public.payslips where company_id = cid and run_id = r.id and is_current)
     or exists (select 1 from public.payslips where company_id = cid and run_id = r.id and is_current and status = 'draft')
     or (coalesce(st.close_blocks_on_review, true) and exists (select 1 from public.payslips where company_id = cid and run_id = r.id and is_current and status = 'review_requested')) then
    raise exception 'payroll: not ready' using errcode = 'P0001';
  end if;
  update public.pay_runs set status = 'closed', closed_by = app.membership_id(), closed_at = now() where id = r.id;
  perform app.payroll_event(null, 'run.close', jsonb_build_object('run_id', r.id, 'name', r.name));
end $$;
revoke all on function public.payroll_close(uuid) from public, anon;
grant execute on function public.payroll_close(uuid) to authenticated;

-- Reopen a closed run (not a paid or locked one). A reason is required and kept.
create function public.payroll_reopen(p_run_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); r public.pay_runs%rowtype; why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not app.payroll_can('payroll.run.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.pay_runs where id = p_run_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if r.status <> 'closed' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if why is null or length(why) < 3 or length(why) > 300 then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
  update public.pay_runs set status = 'open', reopened_reason = why, closed_by = null, closed_at = null where id = r.id;
  perform app.payroll_event(null, 'run.reopen', jsonb_build_object('run_id', r.id, 'name', r.name, 'reason', why));
end $$;
revoke all on function public.payroll_reopen(uuid, text) from public, anon;
grant execute on function public.payroll_reopen(uuid, text) to authenticated;

create function public.payroll_mark_paid(p_run_id uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); r public.pay_runs%rowtype; d date := coalesce(p_date, current_date);
begin
  if not app.payroll_can('payroll.run.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.pay_runs where id = p_run_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if r.status <> 'closed' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if d > current_date or d < r.period_start then raise exception 'payroll: date' using errcode = 'P0001'; end if;
  update public.pay_runs set status = 'paid', paid_at = d::timestamptz where id = r.id;
  update public.payslips set paid_at = d::timestamptz where company_id = cid and run_id = r.id and is_current;
  perform app.payroll_event(null, 'run.paid', jsonb_build_object('run_id', r.id, 'name', r.name, 'date', d));
end $$;
revoke all on function public.payroll_mark_paid(uuid, date) from public, anon;
grant execute on function public.payroll_mark_paid(uuid, date) to authenticated;

create function public.payroll_lock(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); r public.pay_runs%rowtype;
begin
  if not app.payroll_can('payroll.run.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.pay_runs where id = p_run_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if r.status <> 'paid' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  update public.pay_runs set status = 'locked' where id = r.id;
  perform app.payroll_event(null, 'run.lock', jsonb_build_object('run_id', r.id, 'name', r.name));
end $$;
revoke all on function public.payroll_lock(uuid) from public, anon;
grant execute on function public.payroll_lock(uuid) to authenticated;

-- The list to pay. Account details only for people who may export the report.
create function public.payroll_report(p_run_id uuid)
returns table (payslip_id uuid, employee_id uuid, name text, name_local text, branch_id uuid, branch_name text, branch_name_local text,
               status text, currency_code text, gross numeric, deductions numeric, net numeric,
               payment_method text, bank_name text, account_name text, account_no text)
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); full_detail boolean := app.payroll_can('payroll.report.export');
begin
  if not (full_detail or app.payroll_can('payroll.payslip.view')) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.pay_runs where id = p_run_id and company_id = cid) then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  return query
    select s.id, s.employee_id, e.name, e.name_local, e.branch_id, b.name, b.name_local, s.status, s.currency_code, s.gross, s.deductions, s.net,
           pr.payment_method,
           case when full_detail then pr.bank_name end, case when full_detail then pr.account_name end, case when full_detail then pr.account_no end
    from public.payslips s
    join public.employees e on e.company_id = s.company_id and e.id = s.employee_id
    left join public.branches b on b.company_id = e.company_id and b.id = e.branch_id
    left join public.employee_pay_profiles pr on pr.company_id = s.company_id and pr.employee_id = s.employee_id
    where s.company_id = cid and s.run_id = p_run_id and s.is_current and s.status <> 'draft'
    order by e.name limit 2000;
end $$;
revoke all on function public.payroll_report(uuid) from public, anon;
grant execute on function public.payroll_report(uuid) to authenticated;

-- Header facts of a run for the report page.
create function public.payroll_run_info(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); r public.pay_runs%rowtype;
begin
  if not app.payroll_can_prepare() and not app.payroll_can('payroll.report.export') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.pay_runs where id = p_run_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status, 'period_start', r.period_start, 'period_end', r.period_end,
    'closed_at', r.closed_at, 'paid_at', r.paid_at, 'reopened_reason', r.reopened_reason,
    'drafts', (select count(*) from public.payslips where company_id = cid and run_id = r.id and is_current and status = 'draft'),
    'reviews', (select count(*) from public.payslips where company_id = cid and run_id = r.id and is_current and status = 'review_requested'),
    'exports', case when app.payroll_can('payroll.report.export') then coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'rows', x.row_count, 'at', x.created_at) order by x.created_at desc)
       from public.payroll_exports x where x.company_id = cid and x.run_id = r.id), '[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.payroll_run_info(uuid) from public, anon;
grant execute on function public.payroll_run_info(uuid) to authenticated;

-- Log a download (CSV or print) with who and when.
create function public.payroll_log_export(p_run_id uuid, p_kind text, p_rows integer) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not app.payroll_can('payroll.report.export') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('csv', 'print') or not exists (select 1 from public.pay_runs where id = p_run_id and company_id = cid) then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  insert into public.payroll_exports (company_id, run_id, kind, row_count, created_by) values (cid, p_run_id, p_kind, greatest(coalesce(p_rows, 0), 0), app.membership_id());
  perform app.payroll_event(null, 'report.export', jsonb_build_object('run_id', p_run_id, 'kind', p_kind, 'rows', p_rows));
end $$;
revoke all on function public.payroll_log_export(uuid, text, integer) from public, anon;
grant execute on function public.payroll_log_export(uuid, text, integer) to authenticated;
