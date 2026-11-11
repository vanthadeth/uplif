import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { isLocale } from "@/lib/languages";
import { ConsoleShell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, claims, profile, company, permissions, isOwner, pendingSupport } = await loadSession();
  if (!state.signedIn) redirect("/login");
  if (!state.hasProfile) redirect("/profile");
  return (
    <ConsoleShell companyName={company?.name ?? ""} companyNameLocal={company?.name_local ?? null} userName={profile?.full_name ?? ""} userEmail={typeof claims?.email === "string" ? claims.email : ""}
      userId={claims?.sub ?? ""} permissions={permissions} isOwner={isOwner} pendingSupport={pendingSupport} profileLocale={isLocale(profile?.locale) ? profile.locale : "en"}>
      {children}
    </ConsoleShell>
  );
}
