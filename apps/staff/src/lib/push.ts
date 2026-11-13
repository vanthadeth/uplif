import { createClient } from "@/lib/supabase/client";

/** The app's public web-push key. Without it the phone-alerts switch is hidden. */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const b64url = (buf: ArrayBuffer | null) => {
  if (!buf) return "";
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.ready);
}

/** This phone's current push address, if alerts are on here and still saved for the signed-in person. */
export async function pushOnHere(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return false;
  const { data, error } = await createClient().rpc("my_push_registered", { p_endpoint: sub.endpoint });
  return !error && data === true;
}

export type EnableResult = "ok" | "denied" | "error";

export async function enablePush(): Promise<EnableResult> {
  try {
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (perm !== "granted") return "denied";
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const { error } = await createClient().rpc("save_push_subscription", {
      p_endpoint: sub.endpoint, p_p256dh: b64url(sub.getKey("p256dh")), p_auth: b64url(sub.getKey("auth")), p_user_agent: navigator.userAgent.slice(0, 300),
    });
    return error ? "error" : "ok";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<boolean> {
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await createClient().rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}
