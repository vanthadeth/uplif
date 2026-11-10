import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { ConsoleShell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, state } = await loadSession();
  if (!state.signedIn) redirect("/login");
  if (!state.hasProfile) redirect("/profile");
  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from("companies").select("name, name_local").maybeSingle(),
    supabase.from("profiles").select("full_name").maybeSingle(),
  ]);
  return (
    <ConsoleShell companyName={company?.name ?? ""} companyNameLocal={company?.name_local ?? null} userName={profile?.full_name ?? ""}>
      {children}
    </ConsoleShell>
  );
}
