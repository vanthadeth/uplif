import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "./safe-next";
import type { SignInMethodsData } from "./types";

/**
 * The /auth/telegram route every app needs. The Supabase function has checked Telegram's reply and sent a one-time
 * token; this turns it into a session in this app, then lets the person continue.
 *   // apps/<app>/src/app/auth/telegram/route.ts
 *   export const GET = telegramReturnRoute(createClient);
 */
export function telegramReturnRoute(getClient: () => Promise<SupabaseClient>) {
  return async function GET(request: NextRequest) {
    const { origin, searchParams } = request.nextUrl;
    const tokenHash = searchParams.get("token_hash");
    if (tokenHash) {
      const supabase = await getClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (!error) return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next")) ?? "/"}`);
    }
    return NextResponse.redirect(`${origin}/login?error=1`);
  };
}

/** For the /account page of any app: the signed-in user's sign-in methods. */
export async function loadSignInMethods(supabase: SupabaseClient): Promise<{ methods: SignInMethodsData | null; failed: boolean }> {
  const { data, error } = await supabase.rpc("my_sign_in_methods");
  return { methods: (data as SignInMethodsData | null) ?? null, failed: !!error };
}
