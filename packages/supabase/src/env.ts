// Public values only. The service-role key must never be read in this app.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function requireSupabaseEnv() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.",
    );
  }
  return { url: supabaseUrl, key: supabasePublishableKey };
}

/**
 * How long a browser stays signed in: the session cookie lives 30 days from the last visit (the proxy renews it on
 * every request). Every Supabase client in every app must use these options so the rule is the same everywhere.
 * The server-side limit is the Supabase Auth setting "Time-box user sessions" (set it to 30 days as well).
 */
export const SESSION_COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 30 } as const;
