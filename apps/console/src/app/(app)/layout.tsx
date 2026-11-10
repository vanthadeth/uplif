import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { ConsoleShell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, claims, profile, company } = await loadSession();
  if (!state.signedIn) redirect("/login");
  if (!state.hasProfile) redirect("/profile");
  return (
    <ConsoleShell companyName={company?.name ?? ""} companyNameLocal={company?.name_local ?? null} userName={profile?.full_name ?? ""}
      userId={claims?.sub ?? ""} profileLocale={profile?.locale === "km" ? "km" : "en"}>
      {children}
    </ConsoleShell>
  );
}
