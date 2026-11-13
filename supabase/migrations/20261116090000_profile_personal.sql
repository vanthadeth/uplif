-- UPLIF Me profile: personal information (nickname, two phones, address, two emergency contacts) and the manager's contact card.
--  * Personal details live on the person's own profile (profiles, profile_phones). Only that person reads or writes them, through
--    RLS on their own rows. A manager still sees only what the person shares, through get_member_profile (unchanged).
--  * my_profile now also returns the person's role and their manager's position and, when the manager chose to share phone
--    numbers (membership_sharing.share_phones), the manager's first phone number and Telegram user name.
alter table public.profiles
  add column nickname text check (nickname is null or length(nickname) <= 40),
  add column emergency_relation text check (emergency_relation is null or length(emergency_relation) <= 40),
  add column emergency2_name text check (emergency2_name is null or length(emergency2_name) <= 120),
  add column emergency2_phone text check (emergency2_phone is null or emergency2_phone ~ '^\+?[0-9 ()-]{6,20}$'),
  add column emergency2_relation text check (emergency2_relation is null or length(emergency2_relation) <= 40);
grant update (nickname, emergency_relation, emergency2_name, emergency2_phone, emergency2_relation) on public.profiles to authenticated;

-- Read the caller's own personal details. Security invoker: RLS limits every row to the caller.
create function public.my_personal() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'nickname', p.nickname,
    'date_of_birth', p.date_of_birth,
    'address', p.address_line1,
    'phones', coalesce((select jsonb_agg(x.number order by x.created_at) from (
       select number, created_at from public.profile_phones where user_id = p.user_id and label = 'mobile' order by created_at limit 2) x), '[]'::jsonb),
    'emergency', jsonb_build_array(
       jsonb_build_object('name', p.emergency_name, 'relation', p.emergency_relation, 'phone', p.emergency_phone),
       jsonb_build_object('name', p.emergency2_name, 'relation', p.emergency2_relation, 'phone', p.emergency2_phone)))
  from public.profiles p where p.user_id = (select auth.uid())
$$;

-- Save the caller's own personal details in one go. Empty text clears a field. Bad phone numbers fail the table checks.
create function public.my_save_personal(p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  n1 text := nullif(btrim(p ->> 'phone1'), '');
  n2 text := nullif(btrim(p ->> 'phone2'), '');
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.profiles set
    nickname = nullif(btrim(p ->> 'nickname'), ''),
    date_of_birth = nullif(p ->> 'date_of_birth', '')::date,
    address_line1 = nullif(btrim(p ->> 'address'), ''),
    emergency_name = nullif(btrim(p ->> 'e1_name'), ''),
    emergency_relation = nullif(btrim(p ->> 'e1_relation'), ''),
    emergency_phone = nullif(btrim(p ->> 'e1_phone'), ''),
    emergency2_name = nullif(btrim(p ->> 'e2_name'), ''),
    emergency2_relation = nullif(btrim(p ->> 'e2_relation'), ''),
    emergency2_phone = nullif(btrim(p ->> 'e2_phone'), '')
  where user_id = uid;
  if not found then raise exception 'no profile' using errcode = 'P0002'; end if;
  delete from public.profile_phones where user_id = uid and label = 'mobile';
  if n1 is not null then insert into public.profile_phones (user_id, label, number) values (uid, 'mobile', n1); end if;
  if n2 is not null then insert into public.profile_phones (user_id, label, number) values (uid, 'mobile', n2); end if;
end $$;

revoke execute on function public.my_personal(), public.my_save_personal(jsonb) from public, anon;
grant execute on function public.my_personal(), public.my_save_personal(jsonb) to authenticated;

-- my_profile: same as before plus role and the manager's card.
create or replace function public.my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  eid uuid := app.my_employee_id();
  e public.employees%rowtype;
  co public.companies%rowtype;
  mgr public.employees%rowtype;
  mgr_user uuid;
  shared boolean := false;
begin
  if not (select app.is_active_member()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if eid is null then return jsonb_build_object('linked', false); end if;
  select * into e from public.employees where id = eid and company_id = cid;
  select * into co from public.companies where id = cid;
  select * into mgr from public.employees where id = e.reports_to_id and company_id = cid;
  if mgr.id is not null and mgr.membership_id is not null then
    select m.user_id into mgr_user from public.memberships m where m.id = mgr.membership_id and m.company_id = cid;
    select coalesce(s.share_phones, false) into shared from public.membership_sharing s where s.membership_id = mgr.membership_id and s.company_id = cid;
    shared := coalesce(shared, false);
  end if;
  return jsonb_build_object(
    'linked', true,
    'company', jsonb_build_object('name', co.name, 'name_local', co.name_local),
    'position', (select jsonb_build_object('name', p.name, 'name_local', p.name_local) from public.positions p where p.id = e.position_id and p.company_id = cid),
    'department', (select jsonb_build_object('name', d.name, 'name_local', d.name_local) from public.departments d where d.id = e.department_id and d.company_id = cid),
    'reports_to', (select jsonb_build_object('name', r.name, 'name_local', r.name_local) from public.employees r where r.id = e.reports_to_id and r.company_id = cid),
    'employment_date', e.employment_date,
    'role', (select jsonb_build_object('name', r.name, 'name_local', r.name_local)
             from public.membership_roles mr join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
             where mr.membership_id = e.membership_id and mr.company_id = cid order by r.name limit 1),
    'manager', case when mgr.id is null then null else jsonb_build_object(
      'name', mgr.name, 'name_local', mgr.name_local,
      'position', (select jsonb_build_object('name', p.name, 'name_local', p.name_local) from public.positions p where p.id = mgr.position_id and p.company_id = cid),
      'phone', case when shared then (select ph.number from public.profile_phones ph where ph.user_id = mgr_user order by ph.created_at limit 1) end,
      'telegram', case when shared then (select t.username from public.telegram_links t where t.user_id = mgr_user) end) end);
end $$;
