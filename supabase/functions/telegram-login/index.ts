// Telegram sign-in for UPLIF.
//
// Supabase's own custom provider refuses users without an email address, and Telegram gives none. This function
// does the OpenID Connect steps itself, then signs the person in as a user with a placeholder address.
//
//   1. Console button -> GET /functions/v1/telegram-login?next=/        (start: sends the person to Telegram)
//      Linking instead of signing in: ?link=<ticket> (from the console's start_telegram_link()), see "link mode" below.
//   2. Telegram       -> GET /functions/v1/telegram-login?code&state    (finish: checks everything, makes a one-time link)
//   3. This function  -> redirects to <console>/auth/telegram?token_hash=...   (the console turns it into a session)
//
// The Supabase admin key never leaves Supabase: it is only used here. Secrets to set (Edge Functions -> Secrets):
//   TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, CONSOLE_URL (for example https://uplif-console.vercel.app)
import { createClient } from "npm:@supabase/supabase-js@2";
import { openCookie, pkceChallenge, placeholderEmail, randomToken, readCookie, safeNext, sealCookie, sha256Hex, verifyIdToken, type Jwk } from "./lib.ts";

const ISSUER = "https://oauth.telegram.org";
const COOKIE = "tg_login";
const env = (k: string) => Deno.env.get(k) ?? "";

const clientId = env("TELEGRAM_CLIENT_ID");
const clientSecret = env("TELEGRAM_CLIENT_SECRET");
const consoleUrl = env("CONSOLE_URL").replace(/\/$/, "");
const supabaseUrl = env("SUPABASE_URL");
const selfUrl = `${supabaseUrl}/functions/v1/telegram-login`;

const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const back = (path: string) => `${consoleUrl}${path}`;
const redirect = (to: string, cookie?: string) =>
  new Response(null, { status: 302, headers: { Location: to, ...(cookie ? { "Set-Cookie": cookie } : {}), "Cache-Control": "no-store" } });
const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/functions/v1/telegram-login; HttpOnly; Secure; SameSite=Lax`;
const fail = (why: string, to = "/login?error=1") => { console.error("telegram-login:", why); return redirect(back(to), cookieHeader("", 0)); };

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!clientId || !clientSecret || !consoleUrl) return new Response("Telegram sign-in is not configured", { status: 503 });
  const url = new URL(req.url);

  // Step 1: send the person to Telegram.
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    const state = randomToken(), verifier = randomToken(48);
    // Link mode: a signed-in person asked to add Telegram to their account. The ticket (single use, 10 minutes)
    // proves which user that is; the browser never sends a user id.
    let linkUser: string | null = null;
    const ticket = url.searchParams.get("link");
    if (ticket) {
      const hash = await sha256Hex(ticket);
      const { data: intent } = await admin.from("telegram_link_intents").select("user_id, expires_at").eq("token_hash", hash).maybeSingle();
      await admin.from("telegram_link_intents").delete().eq("token_hash", hash);
      if (!intent || new Date(intent.expires_at).getTime() < Date.now()) return fail("link ticket invalid or expired", "/account?error=telegram_failed");
      linkUser = intent.user_id;
    }
    const sealed = await sealCookie({ s: state, v: verifier, n: safeNext(url.searchParams.get("next")) ?? "/", u: linkUser, exp: Date.now() + 10 * 60_000 }, clientSecret);
    const auth = new URL(`${ISSUER}/auth`);
    auth.search = new URLSearchParams({
      client_id: clientId, redirect_uri: selfUrl, response_type: "code", scope: "openid profile",
      state, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256",
    }).toString();
    return redirect(auth.toString(), cookieHeader(sealed, 600));
  }

  // Step 2: Telegram is sending the person back.
  const saved = await openCookie<{ s: string; v: string; n: string; u: string | null; exp: number }>(readCookie(req.headers.get("cookie"), COOKIE), clientSecret);
  const linking = !!saved?.u;
  const failTo = linking ? "/account?error=telegram_failed" : "/login?error=1";
  if (url.searchParams.has("error")) return fail(`telegram returned ${url.searchParams.get("error")}`, failTo);
  if (!saved || saved.exp < Date.now() || saved.s !== url.searchParams.get("state")) return fail("state mismatch or expired", failTo);

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

    const tid = String(claims.sub);
    const email = placeholderEmail(tid);
    const profile = { name: claims.name ?? null, username: claims.preferred_username ?? null };
    const { data: owner } = await admin.rpc("telegram_find_user", { p_tid: tid });

    // Link mode: add this Telegram account to the signed-in user. Nobody is signed in or out here.
    if (linking) {
      if (owner && owner !== saved.u) return fail("telegram account belongs to another user", "/account?error=telegram_taken");
      const { data: u } = await admin.auth.admin.getUserById(saved.u!);
      if (!u?.user) return fail("linking user not found", failTo);
      // Telegram sign-in goes through a one-time email link, so every linked user needs an address. Phone-only
      // users get the placeholder one (nobody can receive mail there; it is never shown or used for anything else).
      if (!u.user.email) {
        const { error } = await admin.auth.admin.updateUserById(saved.u!, { email, email_confirm: true });
        if (error) return fail(`placeholder email: ${error.message}`, failTo);
      }
      const { error } = await admin.from("telegram_links").upsert({ user_id: saved.u!, telegram_id: tid, ...profile }, { onConflict: "user_id" });
      if (error) return fail(`save link: ${error.message}`, error.code === "23505" ? "/account?error=telegram_taken" : failTo);
      return redirect(back("/account?linked=telegram"), cookieHeader("", 0));
    }

    // Sign-in mode: sign in as whoever owns this Telegram account, or make a new user.
    let userId: string | null = owner ?? null, userEmail = email;
    if (userId) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      if (!u?.user?.email) return fail("linked user has no email", failTo);
      userEmail = u.user.email;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { provider: "telegram", telegram_id: tid, full_name: claims.name, name: claims.name, avatar_url: claims.picture, username: claims.preferred_username },
      });
      if (createError || !created?.user) return fail(`create user: ${createError?.message ?? "no user"}`, failTo);
      userId = created.user.id;
    }
    await admin.from("telegram_links").upsert({ user_id: userId, telegram_id: tid, ...profile }, { onConflict: "user_id" });

    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: userEmail });
    if (linkError || !data?.properties?.hashed_token) return fail(`link: ${linkError?.message ?? "no token"}`, failTo);
    const dest = new URL(back("/auth/telegram"));
    dest.search = new URLSearchParams({ token_hash: data.properties.hashed_token, next: saved.n }).toString();
    return redirect(dest.toString(), cookieHeader("", 0));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown error");
  }
});
