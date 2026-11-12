// Telegram sign-in for UPLIF.
//
// Supabase's own custom provider refuses users without an email address, and Telegram gives none. This function
// does the OpenID Connect steps itself, then signs the person in as a user with a placeholder address.
//
//   1. Console button -> GET /functions/v1/telegram-login?next=/        (start: sends the person to Telegram)
//   2. Telegram       -> GET /functions/v1/telegram-login?code&state    (finish: checks everything, makes a one-time link)
//   3. This function  -> redirects to <console>/auth/telegram?token_hash=...   (the console turns it into a session)
//
// The Supabase admin key never leaves Supabase: it is only used here. Secrets to set (Edge Functions -> Secrets):
//   TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, CONSOLE_URL (for example https://uplif-console.vercel.app)
import { createClient } from "npm:@supabase/supabase-js@2";
import { openCookie, pkceChallenge, placeholderEmail, randomToken, readCookie, safeNext, sealCookie, verifyIdToken, type Jwk } from "./lib.ts";

const ISSUER = "https://oauth.telegram.org";
const COOKIE = "tg_login";
const env = (k: string) => Deno.env.get(k) ?? "";

const clientId = env("TELEGRAM_CLIENT_ID");
const clientSecret = env("TELEGRAM_CLIENT_SECRET");
const consoleUrl = env("CONSOLE_URL").replace(/\/$/, "");
const supabaseUrl = env("SUPABASE_URL");
const selfUrl = `${supabaseUrl}/functions/v1/telegram-login`;

const redirect = (to: string, cookie?: string) =>
  new Response(null, { status: 302, headers: { Location: to, ...(cookie ? { "Set-Cookie": cookie } : {}), "Cache-Control": "no-store" } });
const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/functions/v1/telegram-login; HttpOnly; Secure; SameSite=Lax`;
const fail = (why: string) => { console.error("telegram-login:", why); return redirect(`${consoleUrl}/login?error=1`, cookieHeader("", 0)); };

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!clientId || !clientSecret || !consoleUrl) return new Response("Telegram sign-in is not configured", { status: 503 });
  const url = new URL(req.url);

  // Step 1: send the person to Telegram.
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    const state = randomToken(), verifier = randomToken(48);
    const sealed = await sealCookie({ s: state, v: verifier, n: safeNext(url.searchParams.get("next")) ?? "/", exp: Date.now() + 10 * 60_000 }, clientSecret);
    const auth = new URL(`${ISSUER}/auth`);
    auth.search = new URLSearchParams({
      client_id: clientId, redirect_uri: selfUrl, response_type: "code", scope: "openid profile",
      state, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256",
    }).toString();
    return redirect(auth.toString(), cookieHeader(sealed, 600));
  }

  // Step 2: Telegram is sending the person back.
  if (url.searchParams.has("error")) return fail(`telegram returned ${url.searchParams.get("error")}`);
  const saved = await openCookie<{ s: string; v: string; n: string; exp: number }>(readCookie(req.headers.get("cookie"), COOKIE), clientSecret);
  if (!saved || saved.exp < Date.now() || saved.s !== url.searchParams.get("state")) return fail("state mismatch or expired");

  try {
    const tokenRes = await fetch(`${ISSUER}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
      body: new URLSearchParams({
        grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: selfUrl, client_id: clientId, code_verifier: saved.v,
      }),
    });
    if (!tokenRes.ok) return fail(`token endpoint ${tokenRes.status}`);
    const { id_token } = await tokenRes.json();
    const jwks = await (await fetch(`${ISSUER}/.well-known/jwks.json`)).json() as { keys: Jwk[] };
    const claims = await verifyIdToken(id_token, jwks.keys, { issuer: ISSUER, audience: clientId });

    const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const email = placeholderEmail(String(claims.sub));
    const { error: createError } = await admin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: { provider: "telegram", telegram_id: String(claims.sub), full_name: claims.name, name: claims.name, avatar_url: claims.picture, username: claims.preferred_username },
    });
    if (createError && createError.code !== "email_exists") return fail(`create user: ${createError.message}`);

    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !data?.properties?.hashed_token) return fail(`link: ${linkError?.message ?? "no token"}`);
    const back = new URL(`${consoleUrl}/auth/telegram`);
    back.search = new URLSearchParams({ token_hash: data.properties.hashed_token, next: saved.n }).toString();
    return redirect(back.toString(), cookieHeader("", 0));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown error");
  }
});
