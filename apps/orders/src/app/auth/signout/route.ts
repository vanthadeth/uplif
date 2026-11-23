import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears this browser's session and goes to the sign-in page. Used when the session belongs to a user that no longer exists.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(`${request.nextUrl.origin}/login`);
}
