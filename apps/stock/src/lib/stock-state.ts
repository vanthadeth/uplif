import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface StockState {
  companyId: string;
  companyName: string;
  companyNameLocal: string | null;
  /** The company's plan includes Stock. */
  module: boolean;
  canRead: boolean;
  canManage: boolean;
}

/** The signed-in person's company, plan and Stock permissions. Cached for one request so the layout and pages share it. */
export const getStockState = cache(async (): Promise<StockState | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const companyId = (data?.claims?.app_metadata as { company_id?: string } | undefined)?.company_id;
  if (!companyId) return null;
  const [mods, perms, companies] = await Promise.all([
    supabase.rpc("my_enabled_modules"), supabase.rpc("my_permissions"), supabase.rpc("list_my_companies"),
  ]);
  const company = companies.data?.find((c) => c.company_id === companyId);
  if (!company) return null;
  const keys = new Map((perms.data ?? []).map((p) => [p.permission_key, p.data_scope]));
  const manage = keys.get("stock.catalog.manage") === "company";
  return {
    companyId, companyName: company.name, companyNameLocal: company.name_local,
    module: (mods.data ?? []).includes("inventory"),
    canRead: manage || keys.has("stock.catalog.read") || keys.has("stock.catalog.manage"),
    canManage: manage,
  };
});
