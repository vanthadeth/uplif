import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// Telegram sign-in return: the Supabase function has checked Telegram's reply and sent a one-time token.
// Turn it into a session here, then let the person continue.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (!error) return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next")) ?? "/"}`);
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
