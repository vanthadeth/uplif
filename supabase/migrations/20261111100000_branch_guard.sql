-- Migration 13: a company always keeps one active branch.
-- Signed-in members cannot deactivate or delete the last active branch (admin tooling and company deletion are not blocked).
-- The company row is locked first so two people cannot each deactivate "the other" last branch at the same time.

create function app.keep_one_active_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.membership_id() is null or not old.is_active then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.is_active then
    return new;
  end if;
  perform 1 from public.companies where id = old.company_id for update;
  if not exists (select 1 from public.branches where company_id = old.company_id and is_active and id <> old.id) then
    raise exception 'a company keeps at least one active branch' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger branches_keep_one_active before update or delete on public.branches
  for each row execute function app.keep_one_active_branch();
