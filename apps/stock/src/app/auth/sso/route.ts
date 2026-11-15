import { ssoReturnRoute } from "@uplif/auth/server";
import { createClient } from "@uplif/supabase/server";

// Single sign-on return: one-time token + matching state from the hub -> session in this app.
export const GET = ssoReturnRoute(createClient);
