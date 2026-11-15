import { ssoHubRoute } from "@uplif/auth/server";
import { createClient } from "@/lib/supabase/server";

// Single sign-on hub: other UPLIF apps send signed-out people here; if they are signed in to UPLIF Admin they are
// handed back with a one-time token (Supabase function sso-handoff). Otherwise they sign in first, then continue.
export const GET = ssoHubRoute(createClient);
