import { loadSession } from "@/lib/auth/session";
import { LookupList } from "@/components/lookup-list";

export default async function DepartmentsPage() {
  const { supabase, companyId, permissions } = await loadSession();
  const canPeople = permissions.includes("org.employee.read");
  // Read as the signed-in user, so row-level security decides what appears. Counts need employee read access.
  const [departments, employees] = await Promise.all([
    supabase.from("departments").select("id, name, name_local").order("name"),
    canPeople ? supabase.from("employees").select("department_id").neq("status", "left") : Promise.resolve({ data: null }),
  ]);
  const counts: Record<string, number> | null = canPeople ? {} : null;
  if (counts) for (const e of employees.data ?? []) if (e.department_id) counts[e.department_id] = (counts[e.department_id] ?? 0) + 1;
  return (
    <LookupList kind="dept" items={departments.data ?? []} counts={counts} departments={[]} roles={[]}
      companyId={companyId ?? ""} canManage={permissions.includes("org.department.manage")} />
  );
}
