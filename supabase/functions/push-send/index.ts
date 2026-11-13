// Phone push for UPLIF Me.
//
// A database trigger (pg_net) calls this function when a notification is created for a person who has turned phone alerts on.
// It looks up that person's saved push addresses and sends each one a short message with no details in it, in the person's
// language. An address the push service says is gone is removed. The database never waits for this function.
//
// Secrets to set (Edge Functions -> Secrets): PUSH_SECRET (long random text; use the same text as the Vault secret `push_secret`),
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (a pair made with `npx web-push generate-vapid-keys`; the public one is also the app's
// NEXT_PUBLIC_VAPID_PUBLIC_KEY), VAPID_SUBJECT (for example mailto:you@example.com). Turn "Verify JWT" off for this function: the
// caller proves itself with the x-push-secret header. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { isGone, safeEqual, wordsFor } from "./lib.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const secret = env("PUSH_SECRET");
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const configured = !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY") && env("VAPID_SUBJECT"));
if (configured) webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!secret || !configured) return json({ error: "not configured" }, 503);
  if (!safeEqual(req.headers.get("x-push-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({})) as { notification_id?: string };
  if (!body.notification_id || !/^[0-9a-f-]{36}$/i.test(body.notification_id)) return json({ error: "bad request" }, 400);

  const { data, error } = await admin.rpc("push_targets", { p_notification_id: body.notification_id });
  if (error) { console.error("push-send: lookup failed", error.message); return json({ error: "lookup failed" }, 500); }
  let sent = 0, dropped = 0, failed = 0;
  await Promise.all((data ?? []).map(async (t: { endpoint: string; p256dh: string; auth: string; locale: string }) => {
    const words = wordsFor(t.locale);
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify({ title: words.title, body: words.body, url: "/notifications" }),
        { TTL: 60 * 60 * 24, urgency: "normal" },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (isGone(status)) { dropped++; await admin.rpc("push_drop_subscription", { p_endpoint: t.endpoint }); }
      else { failed++; console.error("push-send: send failed", status ?? "", (e as Error).message); }
    }
  }));
  return json({ sent, dropped, failed });
});
