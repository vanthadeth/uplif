import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { requireSupabaseEnv, SESSION_COOKIE_OPTIONS } from "./env";

export function createClient() {
  const { url, key } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, key, { cookieOptions: SESSION_COOKIE_OPTIONS });
}
