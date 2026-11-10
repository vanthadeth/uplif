import { loadSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DashboardView } from "./view";

export default async function DashboardPage() {
  const { state, company } = await loadSession();
  if (!state.signedIn) redirect("/login");
  // Read through RLS as the user: this only returns a row when the company claim is valid.
  return <DashboardView company={company} hasClaim={state.hasCompanyClaim} />;
}
