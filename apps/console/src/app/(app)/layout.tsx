import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { isLocale } from "@/lib/languages";
import { ConsoleShell } from "./shell";
import { LockedView } from "./locked";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, claims, profile, company, permissions, isOwner, pendingSupport, lock, supabase } = await loadSession();
  if (!state.signedIn) redirect("/login");
  if (!state.hasProfile) redirect("/profile");
  // A suspended account (for example a trial that has ended) is locked in the database. Say why, and how to fix it.
  if (lock?.locked) {
    const { data: plans } = lock.is_owner ? await supabase.rpc("list_available_plans") : { data: [] };
    return <LockedView reason={lock.reason} isOwner={lock.is_owner} plans={plans ?? []} requested={lock.requested_plan ? { plan: lock.requested_plan, cycle: lock.requested_cycle ?? "month" } : null} companyName={company?.name ?? ""} />;
  }
  return (
    <ConsoleShell companyName={company?.name ?? ""} companyNameLocal={company?.name_local ?? null} userName={profile?.full_name ?? ""} userEmail={typeof claims?.email === "string" ? claims.email : ""}
      userId={claims?.sub ?? ""} permissions={permissions} isOwner={isOwner} pendingSupport={pendingSupport} profileLocale={isLocale(profile?.locale) ? profile.locale : "en"}>
      {children}
    </ConsoleShell>
  );
}
