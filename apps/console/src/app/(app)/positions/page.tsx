import { loadSession } from "@/lib/auth/session";
import { LookupList } from "@/components/lookup-list";

export default async function PositionsPage() {
  const { supabase, companyId, permissions } = await loadSession();
  const canPeople = permissions.includes("org.employee.read");
  const canRoles = permissions.includes("org.role.read");
  const [positions, departments, roles, employees] = await Promise.all([
    supabase.from("positions").select("id, name, name_local, department_id, default_role_id").order("name"),
    supabase.from("departments").select("id, name, name_local").order("name"),
    canRoles ? supabase.from("roles").select("id, name, name_local").order("name") : Promise.resolve({ data: [] }),
    canPeople ? supabase.from("employees").select("position_id").neq("status", "left") : Promise.resolve({ data: null }),
  ]);
  const counts: Record<string, number> | null = canPeople ? {} : null;
  if (counts) for (const e of employees.data ?? []) if (e.position_id) counts[e.position_id] = (counts[e.position_id] ?? 0) + 1;
  return (
    <LookupList kind="pos" items={positions.data ?? []} counts={counts} departments={departments.data ?? []} roles={roles.data ?? []}
      companyId={companyId ?? ""} canManage={permissions.includes("org.position.manage")} />
  );
}
