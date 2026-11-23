import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { requireSupabaseEnv, SESSION_COOKIE_OPTIONS } from "./env";

export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; the proxy refreshes the session.
        }
      },
    },
  });
}
