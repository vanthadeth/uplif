-- T5: post payslips, tell the employee, let them confirm or ask for a review, answer or revise.
-- Posted payslips never change: a revision is a new version, the old one is kept as superseded.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('leave_approved', 'leave_rejected', 'amendment_approved', 'amendment_rejected', 'performance_review', 'promotion', 'transfer',
   'low_stock', 'payslip_posted', 'payslip_review_answered'));

create table public.payslip_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payslip_id uuid not null,
  employee_id uuid not null,
  message text not null check (length(btrim(message)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'answered', 'revised')),
  answer text check (answer is null or length(answer) <= 500),
  new_payslip_id uuid,
  requested_at timestamptz not null default now(),
  answered_by uuid,
  answered_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, payslip_id) references public.payslips (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create unique index payslip_reviews_one_open on public.payslip_reviews (company_id, payslip_id) where status = 'open';
create index payslip_reviews_company_idx on public.payslip_reviews (company_id, status);
create trigger immutable_company_payslip_reviews before update on public.payslip_reviews for each row execute function app.forbid_company_change();
create trigger audit_payslip_reviews after insert or update on public.payslip_reviews for each row execute function app.audit_payroll_row();
alter table public.payslip_reviews enable row level security;
alter table public.payslip_reviews force row level security;
create policy payslip_reviews_select on public.payslip_reviews for select to authenticated
  using (company_id = (select app.company_id()) and (select app.payroll_can_prepare()));
grant select on public.payslip_reviews to authenticated;

-- ---------- posting ----------
create function app.post_payslip(p_company_id uuid, p_payslip_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.payslips%rowtype; r public.pay_runs%rowtype; st public.payroll_settings%rowtype;
begin
  select * into s from public.payslips where id = p_payslip_id and company_id = p_company_id for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  select * into r from public.pay_runs where id = s.run_id and company_id = p_company_id;
  if s.status <> 'draft' or r.status <> 'open' or not s.is_current then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.payslip_lines where company_id = p_company_id and payslip_id = s.id) or s.net <= 0 then
    raise exception 'payroll: empty' using errcode = 'P0001';
  end if;
  select * into st from public.payroll_settings where company_id = p_company_id;
  if coalesce(st.require_second_approver, false) and exists (
       select 1 from public.payroll_events ev where ev.company_id = p_company_id and ev.actor_membership_id = p_actor
         and ev.action in ('line.save', 'line.delete') and ev.detail ->> 'payslip_id' = s.id::text) then
    raise exception 'payroll: second approver' using errcode = 'P0001';
  end if;
  update public.payslips set status = 'posted', posted_by = p_actor, posted_at = now() where id = s.id;
  perform app.payroll_event_for(p_company_id, s.employee_id, 'payslip.post', jsonb_build_object('payslip_id', s.id, 'version', s.version, 'net', s.net), p_actor);
  perform app.notify(p_company_id, s.employee_id, 'payslip_posted', jsonb_build_object('payslip_id', s.id, 'run', r.name, 'version', s.version));
end $$;
revoke all on function app.post_payslip(uuid, uuid, uuid) from public, anon, authenticated;

create function public.payroll_post(p_payslip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.payroll_can('payroll.payslip.post') then raise exception 'not allowed' using errcode = '42501'; end if;
  perform app.post_payslip(app.company_id(), p_payslip_id, app.membership_id());
end $$;
revoke all on function public.payroll_post(uuid) from public, anon;
grant execute on function public.payroll_post(uuid) to authenticated;

-- Post every draft in a run that can be posted. Others are left alone and counted, never half-posted.
create function public.payroll_post_run(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); x record; ok int := 0; skipped int := 0;
begin
  if not app.payroll_can('payroll.payslip.post') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.pay_runs where id = p_run_id and company_id = cid) then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  for x in select id from public.payslips where company_id = cid and run_id = p_run_id and is_current and status = 'draft' order by id loop
    begin
      perform app.post_payslip(cid, x.id, app.membership_id());
      ok := ok + 1;
    exception when sqlstate 'P0001' then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('posted', ok, 'skipped', skipped);
end $$;
revoke all on function public.payroll_post_run(uuid) from public, anon;
grant execute on function public.payroll_post_run(uuid) to authenticated;

-- ---------- admin view of one payslip (replaces T4: adds version, dates and reviews) ----------
create or replace function public.payroll_payslip(p_payslip_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); s public.payslips%rowtype;
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', s.id, 'run_id', s.run_id, 'employee_id', s.employee_id, 'status', s.status, 'currency_code', s.currency_code,
    'version', s.version, 'is_current', s.is_current, 'posted_at', s.posted_at, 'confirmed_at', s.confirmed_at,
    'gross', s.gross, 'deductions', s.deductions, 'net', s.net, 'snapshot', s.snapshot,
    'run_status', (select status from public.pay_runs where id = s.run_id and company_id = cid),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'message', v.message, 'status', v.status, 'answer', v.answer,
        'requested_at', v.requested_at, 'answered_at', v.answered_at) order by v.requested_at) from public.payslip_reviews v
        where v.company_id = cid and v.payslip_id = s.id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'pay_item_id', l.pay_item_id, 'label', l.label, 'label_local', l.label_local, 'kind', l.kind,
        'qty', l.qty, 'unit_amount', l.unit_amount, 'amount', l.amount, 'source', l.source, 'source_ref', l.source_ref, 'note', l.note) order by l.kind desc, l.position, l.created_at)
      from public.payslip_lines l where l.company_id = cid and l.payslip_id = s.id), '[]'::jsonb));
end $$;

-- Open reviews and their history, for the Payroll screen.
create function public.payroll_reviews(p_only_open boolean default true)
returns table (id uuid, payslip_id uuid, employee_id uuid, name text, name_local text, run_name text, version integer, message text, status text,
               answer text, requested_at timestamptz, run_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.payroll_can_prepare() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select v.id, v.payslip_id, v.employee_id, e.name, e.name_local, r.name, s.version, v.message, v.status, v.answer, v.requested_at, r.status
    from public.payslip_reviews v
    join public.payslips s on s.company_id = v.company_id and s.id = v.payslip_id
    join public.pay_runs r on r.company_id = s.company_id and r.id = s.run_id
    join public.employees e on e.company_id = v.company_id and e.id = v.employee_id
    where v.company_id = app.company_id() and (not p_only_open or v.status = 'open')
    order by v.requested_at desc limit 200;
end $$;
revoke all on function public.payroll_reviews(boolean) from public, anon;
grant execute on function public.payroll_reviews(boolean) to authenticated;

-- "The figures stand": explain, and the payslip goes back to posted for the employee.
create function public.payroll_answer_review(p_review_id uuid, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); v public.payslip_reviews%rowtype; a text := nullif(btrim(coalesce(p_answer, '')), '');
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.payslip_reviews where id = p_review_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if v.status <> 'open' then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if a is null or length(a) < 3 or length(a) > 500 then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
  update public.payslip_reviews set status = 'answered', answer = a, answered_by = app.membership_id(), answered_at = now() where id = v.id;
  update public.payslips set status = 'posted' where id = v.payslip_id and company_id = cid and status = 'review_requested';
  perform app.payroll_event(v.employee_id, 'review.answer', jsonb_build_object('payslip_id', v.payslip_id, 'review_id', v.id, 'answer', a));
  perform app.notify(cid, v.employee_id, 'payslip_review_answered', jsonb_build_object('payslip_id', v.payslip_id, 'revised', false));
end $$;
revoke all on function public.payroll_answer_review(uuid, text) from public, anon;
grant execute on function public.payroll_answer_review(uuid, text) to authenticated;

-- "You are right": a new version as a draft copy, the old one superseded. The run must still be open.
create function public.payroll_revise_payslip(p_review_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); v public.payslip_reviews%rowtype; s public.payslips%rowtype; nid uuid; n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.payroll_can('payroll.payslip.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.payslip_reviews where id = p_review_id and company_id = cid for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  select * into s from public.payslips where id = v.payslip_id and company_id = cid for update;
  if v.status <> 'open' or s.status <> 'review_requested' or not s.is_current
     or (select status from public.pay_runs where id = s.run_id and company_id = cid) <> 'open' then
    raise exception 'payroll: status' using errcode = 'P0001';
  end if;
  update public.payslips set is_current = false, status = 'superseded' where id = s.id;
  insert into public.payslips (company_id, run_id, employee_id, version, is_current, status, currency_code, rate_home, gross, deductions, net, snapshot)
  values (cid, s.run_id, s.employee_id, s.version + 1, true, 'draft', s.currency_code, s.rate_home, s.gross, s.deductions, s.net, s.snapshot)
  returning id into nid;
  insert into public.payslip_lines (company_id, payslip_id, pay_item_id, label, label_local, kind, qty, unit_amount, amount, source, source_ref, note, position)
    select cid, nid, l.pay_item_id, l.label, l.label_local, l.kind, l.qty, l.unit_amount, l.amount, l.source, l.source_ref, l.note, l.position
    from public.payslip_lines l where l.company_id = cid and l.payslip_id = s.id;
  update public.payslip_reviews set status = 'revised', new_payslip_id = nid, answer = n, answered_by = app.membership_id(), answered_at = now() where id = v.id;
  perform app.payroll_event(s.employee_id, 'review.revise', jsonb_build_object('payslip_id', s.id, 'new_payslip_id', nid, 'review_id', v.id, 'note', n));
  return nid;
end $$;
revoke all on function public.payroll_revise_payslip(uuid, text) from public, anon;
grant execute on function public.payroll_revise_payslip(uuid, text) to authenticated;

-- ---------- the employee side: own payslips, once posted, read only ----------
create function app.my_pay_employee() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app.module_enabled(app.company_id(), 'attendance') then app.my_employee_id() end
$$;
revoke all on function app.my_pay_employee() from public, anon;
grant execute on function app.my_pay_employee() to authenticated;

create function public.my_payslips()
returns table (id uuid, run_name text, plan_kind text, period_start date, period_end date, version integer, is_current boolean, status text,
               currency_code text, net numeric, posted_at timestamptz, confirmed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare eid uuid := app.my_pay_employee();
begin
  if eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.id, r.name, p.kind, r.period_start, r.period_end, s.version, s.is_current, s.status, s.currency_code, s.net, s.posted_at, s.confirmed_at
    from public.payslips s
    join public.pay_runs r on r.company_id = s.company_id and r.id = s.run_id
    join public.pay_plans p on p.company_id = r.company_id and p.id = r.plan_id
    where s.company_id = app.company_id() and s.employee_id = eid and s.posted_at is not null
    order by r.period_start desc, s.version desc limit 120;
end $$;
revoke all on function public.my_payslips() from public, anon;
grant execute on function public.my_payslips() to authenticated;

create function public.my_payslip(p_payslip_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_pay_employee(); s public.payslips%rowtype; r public.pay_runs%rowtype;
begin
  if eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid and employee_id = eid and posted_at is not null;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  select * into r from public.pay_runs where id = s.run_id and company_id = cid;
  return jsonb_build_object(
    'id', s.id, 'run_name', r.name, 'period_start', r.period_start, 'period_end', r.period_end, 'version', s.version, 'is_current', s.is_current,
    'status', s.status, 'currency_code', s.currency_code, 'gross', s.gross, 'deductions', s.deductions, 'net', s.net,
    'posted_at', s.posted_at, 'confirmed_at', s.confirmed_at,
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('message', v.message, 'status', v.status, 'answer', v.answer, 'requested_at', v.requested_at,
        'answered_at', v.answered_at) order by v.requested_at) from public.payslip_reviews v where v.company_id = cid and v.payslip_id = s.id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('label', l.label, 'label_local', l.label_local, 'kind', l.kind, 'qty', l.qty,
        'unit_amount', l.unit_amount, 'amount', l.amount, 'note', l.note) order by l.kind desc, l.position, l.created_at)
      from public.payslip_lines l where l.company_id = cid and l.payslip_id = s.id), '[]'::jsonb));
end $$;
revoke all on function public.my_payslip(uuid) from public, anon;
grant execute on function public.my_payslip(uuid) to authenticated;

create function public.my_confirm_payslip(p_payslip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_pay_employee(); s public.payslips%rowtype;
begin
  if eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid and employee_id = eid and posted_at is not null for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if s.status <> 'posted' or not s.is_current then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  update public.payslips set status = 'confirmed', confirmed_at = now() where id = s.id;
  perform app.payroll_event_for(cid, eid, 'payslip.confirm', jsonb_build_object('payslip_id', s.id, 'version', s.version), app.membership_id());
end $$;
revoke all on function public.my_confirm_payslip(uuid) from public, anon;
grant execute on function public.my_confirm_payslip(uuid) to authenticated;

create function public.my_request_payslip_review(p_payslip_id uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid := app.company_id(); eid uuid := app.my_pay_employee(); s public.payslips%rowtype; m text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if eid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payslips where id = p_payslip_id and company_id = cid and employee_id = eid and posted_at is not null for update;
  if not found then raise exception 'payroll: not found' using errcode = 'P0002'; end if;
  if s.status <> 'posted' or not s.is_current then raise exception 'payroll: status' using errcode = 'P0001'; end if;
  if m is null or length(m) < 3 or length(m) > 500 then raise exception 'payroll: reason' using errcode = 'P0001'; end if;
  insert into public.payslip_reviews (company_id, payslip_id, employee_id, message) values (cid, s.id, eid, m);
  update public.payslips set status = 'review_requested' where id = s.id;
  perform app.payroll_event_for(cid, eid, 'payslip.review_request', jsonb_build_object('payslip_id', s.id, 'message', m), app.membership_id());
end $$;
revoke all on function public.my_request_payslip_review(uuid, text) from public, anon;
grant execute on function public.my_request_payslip_review(uuid, text) to authenticated;
