import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@uplif/supabase/env";
import { safeNext } from "./safe-next";

/**
 * Single sign-on between UPLIF apps. Every app is on its own address, so browsers cannot share one session cookie;
 * instead a signed-out app sends the person to the hub (UPLIF Admin), which hands back a ONE-TIME token for the same
 * user through the `sso-handoff` Supabase function. See packages/auth/README.md.
 *
 * App side (staff, time, stock, ...):
 *   app/auth/sso/start/route.ts  ->  export const GET = ssoStartRoute;
 *   app/auth/sso/route.ts        ->  export const GET = ssoReturnRoute(createClient);
 * Hub side (console only):
 *   app/sso/route.ts             ->  export const GET = ssoHubRoute(createClient);
 */

const COOKIE = "uplif_sso_state";
const hubUrl = (process.env.NEXT_PUBLIC_SSO_HUB_URL ?? "").trim().replace(/\/$/, "");

/** True when this app is told where the hub is (and is not the hub itself). Used by each app's proxy. */
export function ssoEnabledFor(origin: string): boolean {
  return !!hubUrl && hubUrl !== origin;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** App step 1: remember a random state in a cookie, then go ask the hub. */
export function ssoStartRoute(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  if (!ssoEnabledFor(origin)) return NextResponse.redirect(`${origin}/login`);
  const state = randomState();
  const to = new URL(`${hubUrl}/sso`);
  to.search = new URLSearchParams({ app: origin, state, next: safeNext(searchParams.get("next")) ?? "/" }).toString();
  const res = NextResponse.redirect(to.toString());
  // Lax: sent when the hub redirects the browser back here (top-level GET), never on cross-site sub-requests.
  res.cookies.set(COOKIE, state, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/auth/sso", maxAge: 600 });
  return res;
}

/** App step 2: the hub sent a one-time token back. Only accept it if it answers the request this browser started. */
export function ssoReturnRoute(getClient: () => Promise<SupabaseClient>) {
  return async function GET(request: NextRequest) {
    const { origin, searchParams } = request.nextUrl;
    const state = searchParams.get("state");
    const saved = request.cookies.get(COOKIE)?.value;
    const tokenHash = searchParams.get("token_hash");
    let ok = false;
    if (tokenHash && state && saved && state === saved) {
      const supabase = await getClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      ok = !error;
    }
    const res = NextResponse.redirect(ok ? `${origin}${safeNext(searchParams.get("next")) ?? "/"}` : `${origin}/login?error=1`);
    res.cookies.set(COOKIE, "", { path: "/auth/sso", maxAge: 0 });
    return res;
  };
}

/** Hub: if this person is signed in here, ask the function for a one-time token for `app`; else sign in first. */
export function ssoHubRoute(getClient: () => Promise<SupabaseClient>) {
  return async function GET(request: NextRequest) {
    const { origin, searchParams, pathname, search } = request.nextUrl;
    const app = (searchParams.get("app") ?? "").replace(/\/$/, "");
    const state = searchParams.get("state") ?? "";
    const next = safeNext(searchParams.get("next")) ?? "/";
    const supabase = await getClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims) {
      return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const fail = () => NextResponse.redirect(app && state ? `${app}/login?error=1` : `${origin}/`);
    if (!token || !app || !state || !supabaseUrl || !supabasePublishableKey) return fail();
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sso-handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabasePublishableKey },
        body: JSON.stringify({ app, state, next }),
        cache: "no-store",
      });
      if (!res.ok) return fail();
      const { url } = (await res.json()) as { url?: string };
      // Belt and braces: the function already checks the allowlist; never redirect anywhere but the app that asked.
      if (!url || new URL(url).origin !== app) return fail();
      const out = NextResponse.redirect(url);
      out.headers.set("Referrer-Policy", "no-referrer");
      out.headers.set("Cache-Control", "no-store");
      return out;
    } catch {
      return fail();
    }
  };
}
