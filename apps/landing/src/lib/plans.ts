import { createClient } from "@supabase/supabase-js";

export interface PublicPlan {
  code: string; name: string;
  price_month_cents: number | null; price_year_cents: number;
  max_companies: number; max_branches: number | null; max_users: number;
  modules: string[];
}

/**
 * Used only when the price list cannot be read (Supabase unreachable, or public_plans() not applied yet).
 * These are the launch plans from the plans table; the page tells visitors they may be out of date.
 */
export const FALLBACK_PLANS: PublicPlan[] = [
  { code: "lite", name: "Lite", price_month_cents: 500, price_year_cents: 4900, max_companies: 1, max_branches: 3, max_users: 5, modules: ["attendance"] },
  { code: "premium", name: "Premium", price_month_cents: 700, price_year_cents: 6800, max_companies: 3, max_branches: 10, max_users: 20, modules: ["attendance", "field_sales", "inventory"] },
];

/** The standard plans, read through public.public_plans() (the plans table itself is closed to the API). */
export async function loadPlans(): Promise<{ plans: PublicPlan[]; live: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { plans: FALLBACK_PLANS, live: false };
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc("public_plans" as never);
    const list = data as unknown as PublicPlan[] | null;
    if (error || !Array.isArray(list) || list.length === 0) return { plans: FALLBACK_PLANS, live: false };
    return { plans: list, live: true };
  } catch {
    return { plans: FALLBACK_PLANS, live: false };
  }
}

/** 500 -> "$5", 4990 -> "$49.90". Prices are in US dollars. */
export function money(cents: number): string {
  const v = cents / 100;
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
}
