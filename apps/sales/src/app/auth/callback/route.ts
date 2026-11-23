import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@uplif/supabase/server";

// OAuth return: exchange the code for a session, then let "/" decide where the person goes.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next")) ?? "/"}`);
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
