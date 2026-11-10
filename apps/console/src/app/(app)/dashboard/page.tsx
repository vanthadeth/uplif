import { loadSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DashboardView } from "./view";

export default async function DashboardPage() {
  const { supabase, state } = await loadSession();
  if (!state.signedIn) redirect("/login");
  // Read through RLS as the user: this only returns a row when the company claim is valid.
  const { data: company } = await supabase.from("companies").select("name, name_local").maybeSingle();
  return <DashboardView company={company} hasClaim={state.hasCompanyClaim} />;
}
