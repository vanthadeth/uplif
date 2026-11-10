import { loadSession } from "@/lib/auth/session";
import { UsersView } from "./view";

export default async function UsersPage() {
  const { supabase, membershipId } = await loadSession();
  const [members, memberRoles, roles, branches, invitations] = await Promise.all([
    supabase.from("memberships").select("id, display_name, status").order("created_at"),
    supabase.from("membership_roles").select("membership_id, role_id"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("invitations").select("id, label, role_id, branch_id, status, expires_at, created_at").order("created_at", { ascending: false }),
  ]);
  return (
    <UsersView
      myMembershipId={membershipId ?? ""}
      members={members.data ?? []}
      memberRoles={memberRoles.data ?? []}
      roles={roles.data ?? []}
      branches={branches.data ?? []}
      invitations={invitations.data ?? []}
    />
  );
}
