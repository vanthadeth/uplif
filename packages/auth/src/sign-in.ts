import { createClient } from "@uplif/supabase/client";
import { safeNext } from "./safe-next";
import { telegramLoginUrl } from "./telegram";

/** Sign-in buttons for any app's login page: the same two calls everywhere, so every app honors linked accounts. */
export async function startGoogleSignIn(next?: string | null) {
  const dest = safeNext(next) ?? "/";
  return createClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(dest)}` },
  });
}

export function startTelegramSignIn(next?: string | null) {
  location.href = telegramLoginUrl({ next: safeNext(next) ?? "/" });
}
