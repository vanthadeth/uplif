-- Migration 19: the read-only support viewer.
-- One function, platform_support_view(grant_id). It works only for the platform admin who asked, only while the
-- Owner's approval is live (approved and not expired, not ended). It returns a fixed, small snapshot of a company:
-- company details, settings, branches, team members (display name, status, roles) and roles. It never returns
-- sign-in emails or phone numbers, personal profiles, or (when they exist) customers, sales or stock.
-- Every call is written twice: to the platform log and to the company's own audit log, so the Owner sees each look.
-- Nothing here grants any table access: the function is the only way in, and it cannot write anything but those logs.

create function public.platform_support_view(p_grant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := app.assert_platform_admin();
  g public.support_grants;
  c public.companies;
  result jsonb;
begin
  select * into g from public.support_grants where id = p_grant;
  if not found or g.requested_by <> admin then raise exception 'support access not found' using errcode = 'P0002'; end if;
  if app.support_status(g) <> 'approved' then raise exception 'this access is not active' using errcode = 'P0001'; end if;
  select * into c from public.companies where id = g.company_id;

  result := jsonb_build_object(
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'name_local', c.name_local, 'country_code', c.country_code, 'created_at', c.created_at),
    'expires_at', g.expires_at,
    'settings', (select jsonb_build_object('cross_branch_stock_visibility', s.cross_branch_stock_visibility,
                   'attendance_selfie_retention_days', s.attendance_selfie_retention_days)
                 from public.company_settings s where s.company_id = c.id),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object('code', cc.code, 'is_home', cc.is_home) order by cc.is_home desc, cc.code)
                            from public.company_currencies cc where cc.company_id = c.id), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'name_local', b.name_local, 'is_active', b.is_active) order by b.name)
                          from public.branches b where b.company_id = c.id), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'name_local', r.name_local, 'is_system', r.is_system) order by r.name)
                       from public.roles r where r.company_id = c.id), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'status', m.status,
                        'roles', coalesce((select jsonb_agg(distinct r.name) from public.membership_roles mr
                                           join public.roles r on r.id = mr.role_id and r.company_id = mr.company_id
                                           where mr.membership_id = m.id and mr.company_id = m.company_id), '[]'::jsonb))
                        order by m.display_name)
                      from public.memberships m where m.company_id = c.id), '[]'::jsonb));

  perform app.write_support_audit(c.id, 'support_access.view', g.id, jsonb_build_object('sections', jsonb_build_array('company', 'branches', 'team', 'roles')));
  perform app.platform_write_log(admin, 'support_access.view', app.company_owner_user(c.id), jsonb_build_object('grant_id', g.id, 'company_id', c.id));
  return result;
end $$;

revoke all on function public.platform_support_view(uuid) from public, anon;
grant execute on function public.platform_support_view(uuid) to authenticated;
