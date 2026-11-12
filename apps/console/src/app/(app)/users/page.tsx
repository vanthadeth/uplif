import { loadSession } from "@/lib/auth/session";
import { UsersView } from "./view";
import type { Seats } from "./invite-panel";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ invite?: string; employee?: string }> }) {
  const { invite, employee } = await searchParams;
  const { supabase, membershipId, permissions, companyId, company } = await loadSession();
  // Everything is read as the signed-in user through row-level security. Permissions only decide what the page offers.
  const can = (k: string) => permissions.includes(k);
  const canRoles = can("org.role.manage");
  const canInvite = can("org.invitation.manage");
  const [members, memberRoles, roles, branches, invitations, overrides, catalog, employees, positions, seats] = await Promise.all([
    supabase.from("memberships").select("id, display_name, status").order("created_at"),
    supabase.from("membership_roles").select("id, membership_id, role_id, branch_id"),
    supabase.from("roles").select("id, name, name_local").order("name"),
    supabase.from("branches").select("id, name, name_local, is_active").order("name"),
    supabase.from("invitations")
      .select("id, label, role_id, branch_id, status, expires_at, created_at, created_by, accepted_at, employee_record_id, roles, overrides, note")
      .order("created_at", { ascending: false }),
    canRoles ? supabase.from("membership_permission_overrides").select("id, membership_id, permission_key, effect, data_scope, reason, expires_at").order("created_at") : Promise.resolve({ data: [] }),
    canRoles ? supabase.from("permissions").select("key, description, description_local").order("key") : Promise.resolve({ data: [] }),
    canInvite ? supabase.from("employees").select("id, name, name_local, membership_id, status, position_id").order("name") : Promise.resolve({ data: [] }),
    canInvite ? supabase.from("positions").select("id, name, name_local, default_role_id").order("name") : Promise.resolve({ data: [] }),
    canInvite ? supabase.rpc("invite_seats") : Promise.resolve({ data: null }),
  ]);
  return (
    <UsersView
      myMembershipId={membershipId ?? ""}
      companyId={companyId ?? ""}
      companyName={company?.name ?? ""}
      companyNameLocal={company?.name_local ?? null}
      members={members.data ?? []}
      memberRoles={memberRoles.data ?? []}
      roles={roles.data ?? []}
      branches={branches.data ?? []}
      invitations={invitations.data ?? []}
      employees={employees.data ?? []}
      positions={positions.data ?? []}
      seats={(seats.data as Seats | null) ?? null}
      canInvite={canInvite}
      canEdit={can("org.member.update")}
      canRoles={canRoles}
      canCreateEmployee={can("org.employee.manage")}
      overrides={overrides.data ?? []}
      catalog={catalog.data ?? []}
      openInvite={invite === "1"}
      presetEmployeeId={employee}
    />
  );
}
