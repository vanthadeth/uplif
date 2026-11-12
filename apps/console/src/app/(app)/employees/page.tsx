import { loadSession } from "@/lib/auth/session";
import { EmployeeList } from "./list";

export default async function EmployeesPage() {
  const { supabase, companyId, permissions } = await loadSession();
  const can = (k: string) => permissions.includes(k);
  // Everything is read as the signed-in user through row-level security: a team-scope reader sees only their own
  // team, a company-scope reader sees everyone. Permissions only decide what the page offers.
  const [employees, departments, positions, branches, members] = await Promise.all([
    supabase.from("employees")
      .select("id, employee_no, name, name_local, department_id, position_id, branch_id, reports_to_id, membership_id, employment_date, status")
      .order("name"),
    supabase.from("departments").select("id, name, name_local").order("name"),
    supabase.from("positions").select("id, name, name_local").order("name"),
    can("org.branch.read") ? supabase.from("branches").select("id, name, name_local").order("name") : Promise.resolve({ data: [] }),
    can("org.member.read") ? supabase.from("memberships").select("id, display_name, status").neq("status", "removed").order("created_at") : Promise.resolve({ data: [] }),
  ]);
  return (
    <EmployeeList
      employees={employees.data ?? []}
      departments={departments.data ?? []}
      positions={positions.data ?? []}
      branches={branches.data ?? []}
      members={members.data ?? []}
      companyId={companyId ?? ""}
      canManage={can("org.employee.manage")}
    />
  );
}
