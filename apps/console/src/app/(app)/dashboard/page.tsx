import { loadSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DashboardView, type DashboardData } from "./view";

export default async function DashboardPage() {
  const { state, company, supabase, permissions } = await loadSession();
  if (!state.signedIn) redirect("/login");
  if (!company) return <DashboardView company={null} hasClaim={state.hasCompanyClaim} data={null} />;

  // Everything is read as the signed-in user through RLS, and only what their permissions allow is asked for.
  // This hides cards; the database refuses the rows regardless.
  const can = (k: string) => permissions.includes(k);
  const canMembers = can("org.member.read");
  const canInvites = can("org.invitation.manage");
  const canBranches = can("org.branch.read");
  const canRoles = can("org.role.read");
  const canAudit = can("org.audit.read");
  const canPlan = can("org.settings.update") || can("org.company.update");
  const canSetupWork = can("attendance.schedule.manage");
  const none = Promise.resolve({ data: null });

  const [members, invitations, branches, roles, audit, co, work] = await Promise.all([
    canMembers || canAudit ? supabase.from("memberships").select("id, display_name, status") : none,
    canInvites ? supabase.from("invitations").select("id, label, role_id, branch_id, expires_at, created_at").eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }) : none,
    canBranches ? supabase.from("branches").select("id, name, name_local, is_active").order("created_at") : none,
    canRoles || canInvites ? supabase.from("roles").select("id, name, name_local").order("name") : none,
    canAudit ? supabase.from("audit_log").select("id, created_at, membership_id, action, details").order("created_at", { ascending: false }).limit(8) : none,
    canPlan ? supabase.from("companies").select("created_at").maybeSingle() : none,
    canSetupWork ? supabase.from("company_settings").select("work_setup_done").maybeSingle() : none,
  ]);

  const data: DashboardData = {
    can: { members: canMembers, invites: canInvites, branches: canBranches, roles: canRoles, audit: canAudit, plan: canPlan, createBranch: can("org.branch.create") },
    members: members.data ?? [],
    invitations: invitations.data ?? [],
    branches: branches.data ?? [],
    roles: roles.data ?? [],
    audit: audit.data ?? [],
    workSetupNeeded: canSetupWork && (work.data as { work_setup_done: boolean } | null)?.work_setup_done === false,
    companyCreatedAt: (co.data as { created_at: string } | null)?.created_at ?? null,
  };
  return <DashboardView company={company} hasClaim={state.hasCompanyClaim} data={data} />;
}
