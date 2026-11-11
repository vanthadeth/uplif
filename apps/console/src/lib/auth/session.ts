import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nextStep, type SessionState } from "./next-step";

/**
 * Reads everything as the signed-in user, through RLS. Wrapped in React `cache` so the layout and
 * the page of one request share a single read instead of repeating the database round trips.
 */
export const loadSession = cache(async function loadSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = !!claims?.sub;
  const companyId = (claims?.app_metadata as { company_id?: string } | undefined)?.company_id;
  let hasProfile = false;
  let companyCount = 0;
  let profile: { full_name: string; locale: string } | null = null;
  let company: { name: string; name_local: string | null } | null = null;
  let permissions: string[] = [];
  let isOwner = false;
  let pendingSupport = 0;
  if (signedIn) {
    // One parallel round trip for everything the shell and guards need.
    const [p, companies, c, perms, support] = await Promise.all([
      supabase.from("profiles").select("full_name, locale").maybeSingle(),
      supabase.rpc("list_my_companies"),
      companyId ? supabase.from("companies").select("name, name_local").maybeSingle() : Promise.resolve({ data: null }),
      companyId ? supabase.rpc("my_permissions") : Promise.resolve({ data: null }),
      // Only the company Owner may call this; anyone else gets an error, which is how we know to hide the menu item.
      companyId ? supabase.rpc("my_support_grants") : Promise.resolve({ data: null, error: { message: "no company" } }),
    ]);
    isOwner = !support.error;
    pendingSupport = (support.data ?? []).filter((g) => g.status === "requested").length;
    permissions = (perms.data ?? []).map((x) => x.permission_key);
    profile = p.data;
    company = c.data;
    hasProfile = !!profile;
    companyCount = companies.data?.length ?? 0;
  }
  const membershipId = (claims?.app_metadata as { membership_id?: string } | undefined)?.membership_id;
  const state: SessionState = { signedIn, hasProfile, hasCompanyClaim: !!companyId, companyCount };
  return { supabase, state, companyId, membershipId, claims, profile, company, permissions, isOwner, pendingSupport };
});

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
