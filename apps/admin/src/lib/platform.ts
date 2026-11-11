import { cache } from "react";
import { createClient } from "@uplif/supabase/server";

/**
 * Who is signed in and whether they are a platform admin. The check is the database function
 * is_platform_admin(), which reads the closed platform_admins table; this app never reads company tables.
 */
export const loadPlatform = cache(async function loadPlatform() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, signedIn: false as const, isAdmin: false, email: "", name: "" };
  const { data: ok } = await supabase.rpc("is_platform_admin");
  const email = typeof claims.email === "string" ? claims.email : "";
  const meta = claims.user_metadata as { full_name?: string; name?: string } | undefined;
  return { supabase, signedIn: true as const, isAdmin: ok === true, email, name: meta?.full_name ?? meta?.name ?? email };
});
