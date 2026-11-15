// Single sign-on between UPLIF apps (each app has its own address, so browsers cannot share one cookie).
//
//   1. A signed-out app sends the person to the hub (UPLIF Admin) at /sso?app=<app>&state=<random>&next=<path>.
//   2. The hub, if the person is signed in there, POSTs here with the person's own access token.
//   3. This function checks the token and that <app> is on the SSO_APP_URLS list, makes a ONE-TIME sign-in token for
//      that same user and returns the app's /auth/sso address. The hub redirects the browser there.
//   4. The app checks `state` against the cookie it set in step 1, then turns the token into its own session.
//
// The Supabase admin key never leaves Supabase. Secret to set (Edge Functions -> Secrets):
//   SSO_APP_URLS  comma list of the apps that may receive a handoff, for example
//                 https://uplif-me.vercel.app,https://uplif-go.vercel.app,https://uplif-stock.vercel.app,https://uplif-time.vercel.app
//   The platform admin app (UPLIF Platform) must NOT be on this list: it needs its own sign-in plus the authenticator code.
//   HUB_URLS (optional) comma list of origins allowed to call this function from a browser (default: SSO_HUB_URL).
import { createClient } from "npm:@supabase/supabase-js@2";
import { allowedOrigin, safeNext, validState } from "./lib.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const list = (v: string) => v.split(",").map((a) => a.trim().replace(/\/$/, "")).filter(Boolean);
const appUrls = list(env("SSO_APP_URLS"));
const hubUrls = list(env("HUB_URLS") || env("SSO_HUB_URL"));
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  // Called server to server by the hub, never from a page script of another site: no CORS headers are sent.
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!appUrls.length) return json({ error: "not_configured" }, 503);
  // If the caller says where it comes from (browsers always do), it must be the hub.
  const origin = req.headers.get("origin");
  if (origin && hubUrls.length && !hubUrls.includes(origin.replace(/\/$/, ""))) return json({ error: "origin" }, 403);

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthenticated" }, 401);
  const { data: who, error: whoError } = await admin.auth.getUser(jwt);
  if (whoError || !who?.user) return json({ error: "unauthenticated" }, 401);

  let body: { app?: string; state?: string; next?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const app = allowedOrigin(body.app, appUrls);
  if (!app) return json({ error: "app_not_allowed" }, 403);
  if (!validState(body.state)) return json({ error: "bad_state" }, 400);

  // The one-time token is for this very user, found from the verified token, never from the request body.
  const email = who.user.email;
  if (!email) return json({ error: "no_email" }, 409);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) { console.error("sso-handoff:", error?.message); return json({ error: "link" }, 500); }

  const dest = new URL(`${app}/auth/sso`);
  dest.search = new URLSearchParams({ token_hash: data.properties.hashed_token, state: body.state, next: safeNext(body.next) }).toString();
  return json({ url: dest.toString() });
});
