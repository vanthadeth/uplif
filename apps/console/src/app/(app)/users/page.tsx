import { loadSession } from "@/lib/auth/session";
import { UsersView } from "./view";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const { supabase, membershipId } = await loadSession();
  const [members, memberRoles, roles, branches, invitations] = await Promise.all([
    supabase.from("memberships").select("id, display_name, status").order("created_at"),
    supabase.from("membership_roles").select("id, membership_id, role_id, branch_id"),
    supabase.from("roles").select("id, name, name_local").order("name"),
    supabase.from("branches").select("id, name, name_local").eq("is_active", true).order("name"),
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
      openInvite={invite === "1"}
    />
  );
}
