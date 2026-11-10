-- Migration 6: audit changes made by signed-in members to company, settings and branches.
-- Writes without a membership claim (for example inside create_company) are skipped; those RPCs audit themselves.
create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  cid uuid;
  eid uuid;
  details jsonb;
begin
  if app.membership_id() is null then
    return coalesce(new, old);
  end if;
  cid := case when tg_table_name = 'companies' then (rec ->> 'id')::uuid else (rec ->> 'company_id')::uuid end;
  eid := case when tg_table_name = 'company_settings' then cid else (rec ->> 'id')::uuid end;
  if tg_op = 'UPDATE' then
    select jsonb_build_object('old', coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
                              'new', coalesce(jsonb_object_agg(o.key, n.value), '{}'::jsonb))
    into details
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
    where o.value is distinct from n.value and o.key <> 'updated_at';
  else
    details := jsonb_build_object('row', rec);
  end if;
  perform app.write_audit(cid, app.membership_id(), tg_table_name || '.' || lower(tg_op), tg_table_name, eid, details);
  return coalesce(new, old);
end $$;
revoke all on function app.audit_row() from public, anon, authenticated;

create trigger audit_companies after update on public.companies for each row execute function app.audit_row();
create trigger audit_company_settings after update on public.company_settings for each row execute function app.audit_row();
create trigger audit_branches after insert or update or delete on public.branches for each row execute function app.audit_row();
