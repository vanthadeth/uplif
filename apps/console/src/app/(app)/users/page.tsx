import { loadSession } from "@/lib/auth/session";
import { UsersView } from "./view";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const { supabase, membershipId, permissions } = await loadSession();
  // Everything is read as the signed-in user through row-level security. Permissions only decide what the page offers.
  const canRoles = permissions.includes("org.role.manage");
  const [members, memberRoles, roles, branches, invitations, overrides, catalog] = await Promise.all([
    supabase.from("memberships").select("id, display_name, status").order("created_at"),
    supabase.from("membership_roles").select("id, membership_id, role_id, branch_id"),
    supabase.from("roles").select("id, name, name_local").order("name"),
    supabase.from("branches").select("id, name, name_local, is_active").order("name"),
    supabase.from("invitations").select("id, label, role_id, branch_id, status, expires_at, created_at").order("created_at", { ascending: false }),
    canRoles ? supabase.from("membership_permission_overrides").select("id, membership_id, permission_key, effect, data_scope, reason, expires_at").order("created_at") : Promise.resolve({ data: [] }),
    canRoles ? supabase.from("permissions").select("key, description, description_local").order("key") : Promise.resolve({ data: [] }),
  ]);
  const can = (k: string) => permissions.includes(k);
  return (
    <UsersView
      myMembershipId={membershipId ?? ""}
      members={members.data ?? []}
      memberRoles={memberRoles.data ?? []}
      roles={roles.data ?? []}
      branches={branches.data ?? []}
      invitations={invitations.data ?? []}
      canInvite={can("org.invitation.manage")}
      canEdit={can("org.member.update")}
      canRoles={canRoles}
      overrides={overrides.data ?? []}
      catalog={catalog.data ?? []}
      openInvite={invite === "1"}
    />
  );
}
