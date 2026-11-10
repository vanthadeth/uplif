import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nextStep, type SessionState } from "./next-step";

/** Reads everything as the signed-in user, through RLS. */
export async function loadSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = !!claims?.sub;
  const companyId = (claims?.app_metadata as { company_id?: string } | undefined)?.company_id;
  let hasProfile = false;
  let companyCount = 0;
  if (signedIn) {
    const [{ data: profile }, { data: companies }] = await Promise.all([
      supabase.from("profiles").select("full_name").maybeSingle(),
      supabase.rpc("list_my_companies"),
    ]);
    hasProfile = !!profile;
    companyCount = companies?.length ?? 0;
  }
  const state: SessionState = { signedIn, hasProfile, hasCompanyClaim: !!companyId, companyCount };
  return { supabase, state, companyId, claims };
}

/** Guard for a page: redirect unless the user is exactly at `step`. */
export async function requireStep(step: ReturnType<typeof nextStep>) {
  const session = await loadSession();
  const target = nextStep(session.state);
  if (target !== step) {
    // The picker and the wizard are also reachable from the dashboard when the user has a profile.
    const flexible = session.state.signedIn && session.state.hasProfile && (step === "/companies" || step === "/companies/new");
    if (!flexible) redirect(target);
  }
  return session;
}
