import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface OrdersState {
  userId: string;
  companyId: string;
  companyName: string;
  companyNameLocal: string | null;
  /** The company's plan includes Orders (module key `invoice`). */
  module: boolean;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

/** The signed-in person's company, plan and customer permissions. Cached for one request so the layout and pages share it. */
export const getOrdersState = cache(async (): Promise<OrdersState | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const companyId = (data?.claims?.app_metadata as { company_id?: string } | undefined)?.company_id;
  const userId = data?.claims?.sub;
  if (!companyId || !userId) return null;
  const [mods, perms, companies] = await Promise.all([
    supabase.rpc("my_enabled_modules"), supabase.rpc("my_permissions"), supabase.rpc("list_my_companies"),
  ]);
  const company = companies.data?.find((c) => c.company_id === companyId);
  if (!company) return null;
  const keys = new Set((perms.data ?? []).map((p) => p.permission_key));
  return {
    userId, companyId, companyName: company.name, companyNameLocal: company.name_local,
    module: (mods.data ?? []).includes("invoice"),
    canRead: keys.has("customers.customer.read"),
    canCreate: keys.has("customers.customer.create"),
    canUpdate: keys.has("customers.customer.update"),
  };
});
