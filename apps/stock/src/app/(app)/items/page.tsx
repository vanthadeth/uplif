import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { ItemsView } from "@/components/items-view";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const [items, categories, brands, home] = await Promise.all([
    supabase.from("items").select("id, sku, name, name_local, description, description_local, category_id, brand_id, base_uom, packs, price, currency_code, is_active").order("name"),
    supabase.from("categories").select("id, parent_id, name, name_local, is_active").order("name"),
    supabase.from("brands").select("id, name, name_local, is_active").order("name"),
    supabase.from("company_currencies").select("code").eq("is_home", true).maybeSingle(),
  ]);
  return (
    <ItemsView
      items={(items.data ?? []).map((i) => ({ ...i, packs: Array.isArray(i.packs) ? (i.packs as unknown as { name: string; qty: number }[]) : [] }))}
      categories={categories.data ?? []} brands={brands.data ?? []}
      currency={home.data?.code ?? "USD"} failed={!!items.error}
      companyId={state!.companyId} canManage={state!.canManage}
    />
  );
}
