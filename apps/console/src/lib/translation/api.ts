import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/messages";

// The translation functions are not in the generated database types yet, so calls go through one typed helper.
export async function rpc<T>(client: SupabaseClient<any, any, any>, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** Maps a database error to a message key people can read. */
export function errorKey(err: unknown): MessageKey {
  const m = String((err as { message?: string })?.message ?? err);
  if (m.includes("tokens_mismatch")) return "tl.e.tokens";
  if (m.includes("suggestion_limit")) return "tl.e.limit";
  if (m.includes("text_length")) return "tl.e.length";
  if (m.includes("language_exists")) return "tl.e.exists";
  if (m.includes("invalid_language")) return "tl.e.invalid";
  if (m.includes("language_limit")) return "tl.e.langLimit";
  if (m.includes("machine_busy")) return "tl.e.busy";
  if (m.includes("forbidden") || (err as { code?: string })?.code === "42501") return "tl.e.forbidden";
  return "tl.e.generic";
}

export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
