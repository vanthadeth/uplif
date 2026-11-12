-- Learn tests (UPLIF Me > Learn).
-- Rules (design 2026-11-12, numbers are set per test and default to the agreed values):
--  * A company writes tests with multiple-choice questions (one right answer each), in English and optionally the local
--    language. A test has a pass mark (default 80%) and a retake period (default 90 days from the day it was passed).
--  * Every active employee linked to a sign-in may take every active test. The server grades: the right answers are never
--    sent to the app, and only people with learn.test.manage can read them.
--  * A failed test can be tried again at once. A passed test is done until the retake period ends; it can be retaken
--    from 7 days before it falls due ("due soon") and after ("overdue").
--  * Managers are told only of a failed retake (someone who had passed before and failed this time). Until notifications
--    exist this is shown in the console results, by learn.result.read scope (Owner/Admin company, Manager team).
--  * Nobody writes these tables directly; every change goes through the functions below and is audited.
-- Run the leave migration first.

-- ---------- permission keys ----------
insert into public.permissions (key, description, description_local) values
  ('learn.test.manage', 'Write and publish Learn tests', 'បង្កើត និងផ្សព្វផ្សាយការធ្វើតេស្តសិក្សា'),
  ('learn.result.read', 'See test results and failed retakes', 'មើលលទ្ធផលតេស្ត និងការធ្វើតេស្តឡើងវិញដែលធ្លាក់')
on conflict (key) do nothing;

insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, k.key, 'company'
from public.roles ro cross join (values ('learn.test.manage'), ('learn.result.read')) as k(key)
where ro.is_system and ro.name in ('Owner', 'Admin')
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
select ro.company_id, ro.id, 'learn.result.read', 'team'
from public.roles ro where ro.is_system and ro.name = 'Manager'
on conflict do nothing;

create function app.grant_manager_learn_results() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name = 'Manager' then
    insert into public.role_permissions (company_id, role_id, permission_key, data_scope)
    values (new.company_id, new.id, 'learn.result.read', 'team') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger grant_manager_learn_results after insert on public.roles for each row execute function app.grant_manager_learn_results();

-- ---------- tables ----------
create table public.learn_tests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  title_local text check (title_local is null or length(title_local) <= 200),
  pass_percent integer not null default 80 check (pass_percent between 1 and 100),
  retake_days integer not null default 90 check (retake_days between 1 and 3650),
  archived boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, created_by) references public.memberships (company_id, id) on delete set null (created_by)
);
create index learn_tests_company_idx on public.learn_tests (company_id, archived);

create table public.learn_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  test_id uuid not null,
  position integer not null check (position >= 1),
  prompt text not null check (length(btrim(prompt)) between 1 and 1000),
  prompt_local text check (prompt_local is null or length(prompt_local) <= 1000),
  unique (company_id, id),
  unique (test_id, position),
  foreign key (company_id, test_id) references public.learn_tests (company_id, id) on delete cascade
);

create table public.learn_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  question_id uuid not null,
  position integer not null check (position >= 1),
  label text not null check (length(btrim(label)) between 1 and 500),
  label_local text check (label_local is null or length(label_local) <= 500),
  is_correct boolean not null default false,
  unique (question_id, position),
  foreign key (company_id, question_id) references public.learn_questions (company_id, id) on delete cascade
);
create unique index learn_options_one_correct_idx on public.learn_options (question_id) where is_correct;

create table public.learn_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  test_id uuid not null,
  employee_id uuid not null,
  correct integer not null check (correct >= 0),
  total integer not null check (total >= 1),
  score_percent integer not null check (score_percent between 0 and 100),
  passed boolean not null,
  is_retake boolean not null default false,
  taken_at timestamptz not null default now(),
  foreign key (company_id, test_id) references public.learn_tests (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index learn_attempts_employee_idx on public.learn_attempts (company_id, employee_id, test_id, taken_at desc);

create trigger touch_learn_tests before update on public.learn_tests for each row execute function app.touch_updated_at();
create trigger immutable_company_learn_tests before update on public.learn_tests for each row execute function app.forbid_company_change();
create trigger audit_learn_tests after insert or update or delete on public.learn_tests for each row execute function app.audit_row();
create trigger audit_learn_attempts after insert on public.learn_attempts for each row execute function app.audit_row();

-- ---------- who may read what ----------
create function app.can_read_learn_result(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select app.is_active_member()) and exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = app.company_id()
      and (select app.permission_scope('learn.result.read')) is not null
      and (
        (select app.permission_scope('learn.result.read')) = 'company'
        or ((select app.permission_scope('learn.result.read')) = 'team' and e.id in (select app.team_employee_ids()))
        or ((select app.permission_scope('learn.result.read')) = 'branch' and e.branch_id = any (app.my_branch_ids()))
      ))
$$;
revoke all on function app.can_read_learn_result(uuid) from public, anon;
grant execute on function app.can_read_learn_result(uuid) to authenticated;

alter table public.learn_tests enable row level security;
alter table public.learn_tests force row level security;
alter table public.learn_questions enable row level security;
alter table public.learn_questions force row level security;
alter table public.learn_options enable row level security;
alter table public.learn_options force row level security;
alter table public.learn_attempts enable row level security;
alter table public.learn_attempts force row level security;

-- Tests, questions and the right answers: authors only. Staff go through my_learn_tests() and learn_questions_for().
create policy learn_tests_select on public.learn_tests for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.test.manage')) = 'company');
create policy learn_questions_select on public.learn_questions for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.test.manage')) = 'company');
create policy learn_options_select on public.learn_options for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (select app.permission_scope('learn.test.manage')) = 'company');
create policy learn_attempts_select on public.learn_attempts for select to authenticated
  using (company_id = (select app.company_id()) and (select app.is_active_member())
         and (employee_id = (select app.my_employee_id()) or (select app.can_read_learn_result(employee_id))));
grant select on public.learn_tests, public.learn_questions, public.learn_options, public.learn_attempts to authenticated;

-- ---------- internals ----------
create function app.require_test_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select app.is_active_member()) or (select app.permission_scope('learn.test.manage')) is distinct from 'company' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_test_manage() from public, anon, authenticated;

-- new | failed | passed | due_soon | overdue, from the employee's attempts. A pass counts from the day it was taken.
create function app.learn_status(p_employee_id uuid, p_test_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.learn_tests%rowtype;
  passed_on date;
  due date;
begin
  select * into t from public.learn_tests where id = p_test_id;
  if not found then return null; end if;
  select max(a.taken_at)::date into passed_on from public.learn_attempts a
  where a.test_id = p_test_id and a.employee_id = p_employee_id and a.passed;
  if passed_on is null then
    if exists (select 1 from public.learn_attempts a where a.test_id = p_test_id and a.employee_id = p_employee_id) then return 'failed'; end if;
    return 'new';
  end if;
  due := passed_on + t.retake_days;
  if due < current_date then return 'overdue'; end if;
  if due - current_date <= 7 then return 'due_soon'; end if;
  return 'passed';
end $$;
revoke execute on function app.learn_status(uuid, uuid) from public, anon, authenticated;

-- ---------- authors ----------
-- p_questions: [{"prompt":"..","prompt_local":"..","options":[{"label":"..","label_local":"..","correct":true}, ...]}, ...]
-- Questions are replaced as a whole; earlier attempts keep only their score.
create function public.save_learn_test(p_id uuid, p_title text, p_title_local text, p_pass_percent integer, p_retake_days integer, p_questions jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  tid uuid := p_id;
  q jsonb;
  o jsonb;
  qid uuid;
  qn integer := 0;
  on_ integer;
begin
  perform app.require_test_manage();
  if length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'title is required' using errcode = '22023'; end if;
  if p_pass_percent is null or p_pass_percent not between 1 and 100 then raise exception 'pass mark must be 1 to 100' using errcode = '22023'; end if;
  if p_retake_days is null or p_retake_days not between 1 and 3650 then raise exception 'retake days must be 1 to 3650' using errcode = '22023'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 50 then
    raise exception 'a test needs 1 to 50 questions' using errcode = '22023';
  end if;
  -- Check every question before writing anything.
  for q in select * from jsonb_array_elements(p_questions) loop
    if length(btrim(coalesce(q->>'prompt', ''))) = 0 then raise exception 'every question needs text' using errcode = '22023'; end if;
    if jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') not between 2 and 6 then
      raise exception 'each question needs 2 to 6 answers' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_array_elements(q->'options') x where coalesce((x->>'correct')::boolean, false)) <> 1 then
      raise exception 'each question needs exactly one right answer' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(q->'options') x where length(btrim(coalesce(x->>'label', ''))) = 0) then
      raise exception 'every answer needs text' using errcode = '22023';
    end if;
  end loop;

  if tid is null then
    insert into public.learn_tests (company_id, title, title_local, pass_percent, retake_days, created_by)
    values (cid, btrim(p_title), nullif(btrim(coalesce(p_title_local, '')), ''), p_pass_percent, p_retake_days, app.membership_id())
    returning id into tid;
  else
    update public.learn_tests set title = btrim(p_title), title_local = nullif(btrim(coalesce(p_title_local, '')), ''),
      pass_percent = p_pass_percent, retake_days = p_retake_days
    where id = tid and company_id = cid;
    if not found then raise exception 'test not found' using errcode = 'P0002'; end if;
    delete from public.learn_questions where test_id = tid and company_id = cid;
  end if;

  for q in select * from jsonb_array_elements(p_questions) loop
    qn := qn + 1;
    insert into public.learn_questions (company_id, test_id, position, prompt, prompt_local)
    values (cid, tid, qn, btrim(q->>'prompt'), nullif(btrim(coalesce(q->>'prompt_local', '')), '')) returning id into qid;
    on_ := 0;
    for o in select * from jsonb_array_elements(q->'options') loop
      on_ := on_ + 1;
      insert into public.learn_options (company_id, question_id, position, label, label_local, is_correct)
      values (cid, qid, on_, btrim(o->>'label'), nullif(btrim(coalesce(o->>'label_local', '')), ''), coalesce((o->>'correct')::boolean, false));
    end loop;
  end loop;
  return tid;
end $$;

create function public.archive_learn_test(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_test_manage();
  update public.learn_tests set archived = coalesce(p_archived, true) where id = p_id and company_id = app.company_id();
  if not found then raise exception 'test not found' using errcode = 'P0002'; end if;
end $$;

-- ---------- staff side ----------
create function public.my_learn_tests()
returns table (test_id uuid, title text, title_local text, question_count integer, pass_percent integer, retake_days integer,
               status text, last_score integer, last_taken_at timestamptz, passed_on date, due_on date)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select t.id, t.title, t.title_local,
         (select count(*)::int from public.learn_questions q where q.test_id = t.id),
         t.pass_percent, t.retake_days, app.learn_status(eid, t.id),
         la.score_percent, la.taken_at, lp.d, lp.d + t.retake_days
  from public.learn_tests t
  left join lateral (select a.score_percent, a.taken_at from public.learn_attempts a
                     where a.test_id = t.id and a.employee_id = eid order by a.taken_at desc limit 1) la on true
  left join lateral (select max(a.taken_at)::date d from public.learn_attempts a
                     where a.test_id = t.id and a.employee_id = eid and a.passed) lp on true
  where t.company_id = cid and not t.archived
  order by case app.learn_status(eid, t.id) when 'overdue' then 0 when 'new' then 1 when 'failed' then 1 when 'due_soon' then 2 else 3 end, t.title;
end $$;

-- The questions without the right answers. Only while the test can be taken: new, failed, due soon or overdue.
create function public.learn_questions_for(p_test_id uuid)
returns table (question_id uuid, "position" integer, prompt text, prompt_local text, options jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  st text;
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.learn_tests t where t.id = p_test_id and t.company_id = cid and not t.archived) then
    raise exception 'test not found' using errcode = 'P0002';
  end if;
  st := app.learn_status(eid, p_test_id);
  if st = 'passed' then raise exception 'not due yet' using errcode = 'P0001'; end if;
  return query
  select q.id, q.position, q.prompt, q.prompt_local,
         (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'label_local', o.label_local) order by o.position)
          from public.learn_options o where o.question_id = q.id)
  from public.learn_questions q where q.test_id = p_test_id and q.company_id = cid order by q.position;
end $$;

-- p_answers: {"<question id>": "<option id>", ...}. Missing answers count as wrong.
create function public.submit_learn_attempt(p_test_id uuid, p_answers jsonb)
returns table (score_percent integer, correct integer, total integer, passed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  t public.learn_tests%rowtype;
  st text;
  tot integer;
  ok integer;
  pct integer;
  pas boolean;
  had_pass boolean;
begin
  if not (select app.is_active_member()) or eid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers are required' using errcode = '22023';
  end if;
  select * into t from public.learn_tests where id = p_test_id and company_id = cid and not archived;
  if not found then raise exception 'test not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.employees e where e.id = eid and e.status = 'active') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  st := app.learn_status(eid, p_test_id);
  if st = 'passed' then raise exception 'not due yet' using errcode = 'P0001'; end if;
  select count(*)::int into tot from public.learn_questions q where q.test_id = p_test_id;
  select count(*)::int into ok from public.learn_questions q
  join public.learn_options o on o.question_id = q.id and o.is_correct
  where q.test_id = p_test_id and (p_answers ->> q.id::text) = o.id::text;
  pct := round(100.0 * ok / tot)::int;
  pas := pct >= t.pass_percent;
  had_pass := exists (select 1 from public.learn_attempts a where a.test_id = p_test_id and a.employee_id = eid and a.passed);
  insert into public.learn_attempts (company_id, test_id, employee_id, correct, total, score_percent, passed, is_retake)
  values (cid, p_test_id, eid, ok, tot, pct, pas, had_pass);
  return query select pct, ok, tot, pas;
end $$;

-- ---------- results for people who may read them ----------
create function public.learn_results(p_test_id uuid default null)
returns table (attempt_id uuid, employee_id uuid, name text, name_local text, test_id uuid, title text,
               score_percent integer, passed boolean, is_retake boolean, failed_retake boolean, taken_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.company_id();
begin
  if not (select app.is_active_member()) or (select app.permission_scope('learn.result.read')) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select a.id, e.id, e.name, e.name_local, a.test_id, t.title, a.score_percent, a.passed, a.is_retake,
         (a.is_retake and not a.passed), a.taken_at
  from public.learn_attempts a
  join public.employees e on e.id = a.employee_id and e.company_id = a.company_id
  join public.learn_tests t on t.id = a.test_id and t.company_id = a.company_id
  where a.company_id = cid and (p_test_id is null or a.test_id = p_test_id) and app.can_read_learn_result(a.employee_id)
  order by a.taken_at desc
  limit 300;
end $$;

revoke execute on function public.save_learn_test(uuid, text, text, integer, integer, jsonb) from public, anon;
revoke execute on function public.archive_learn_test(uuid, boolean) from public, anon;
revoke execute on function public.my_learn_tests() from public, anon;
revoke execute on function public.learn_questions_for(uuid) from public, anon;
revoke execute on function public.submit_learn_attempt(uuid, jsonb) from public, anon;
revoke execute on function public.learn_results(uuid) from public, anon;
grant execute on function public.save_learn_test(uuid, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.archive_learn_test(uuid, boolean) to authenticated;
grant execute on function public.my_learn_tests() to authenticated;
grant execute on function public.learn_questions_for(uuid) to authenticated;
grant execute on function public.submit_learn_attempt(uuid, jsonb) to authenticated;
grant execute on function public.learn_results(uuid) to authenticated;
