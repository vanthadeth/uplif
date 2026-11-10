-- Migration 9: Khmer names for system roles and permission descriptions (drafts for the Khmer reviewer).
alter table public.permissions add column description_local text;

update public.permissions p set description_local = v.d from (values
  ('org.company.update', 'កែប្រែប្រវត្តិរូបក្រុមហ៊ុន'),
  ('org.branch.read', 'មើលសាខា'),
  ('org.branch.create', 'បង្កើតសាខា'),
  ('org.branch.update', 'កែប្រែសាខា'),
  ('org.branch.delete', 'លុបសាខា'),
  ('org.member.read', 'មើលសមាជិកក្រុម'),
  ('org.member.update', 'កែប្រែ ឬផ្អាកសមាជិកក្រុម'),
  ('org.role.read', 'មើលតួនាទី និងការកំណត់តួនាទី'),
  ('org.role.manage', 'បង្កើតតួនាទី កែសិទ្ធិ និងកំណត់តួនាទី'),
  ('org.settings.update', 'កែប្រែការកំណត់ក្រុមហ៊ុន'),
  ('org.currency.manage', 'គ្រប់គ្រងរូបិយប័ណ្ណក្រុមហ៊ុន'),
  ('org.payment_term.manage', 'គ្រប់គ្រងលក្ខខណ្ឌទូទាត់'),
  ('org.audit.read', 'មើលកំណត់ហេតុសវនកម្ម'),
  ('org.invitation.manage', 'អញ្ជើញមនុស្ស និងដកហូតការអញ្ជើញ')
) as v(k, d) where p.key = v.k;

create function app.system_role_local_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case p_name
    when 'Owner' then 'ម្ចាស់'
    when 'Admin' then 'អ្នកគ្រប់គ្រងប្រព័ន្ធ'
    when 'Manager' then 'អ្នកគ្រប់គ្រង'
    when 'Sales rep' then 'អ្នកលក់'
    when 'Warehouse' then 'ឃ្លាំង'
    when 'Accountant' then 'គណនេយ្យករ'
    when 'Staff' then 'បុគ្គលិក'
  end
$$;

create function app.default_role_local_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system and new.name_local is null then
    new.name_local := app.system_role_local_name(new.name);
  end if;
  return new;
end $$;
create trigger default_role_local_name before insert on public.roles
  for each row execute function app.default_role_local_name();

update public.roles set name_local = app.system_role_local_name(name) where is_system and name_local is null;

revoke all on function app.system_role_local_name(text), app.default_role_local_name() from public, anon, authenticated;
