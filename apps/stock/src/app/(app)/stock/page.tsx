import { createClient } from "@/lib/supabase/server";
import { StockLevelsView, type LevelRow } from "@/components/stock-levels-view";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const supabase = await createClient();
  const [bal, variants, items, locs] = await Promise.all([
    supabase.from("stock_balances").select("location_id, variant_id, qty").gt("qty", 0),
    supabase.from("item_variants").select("id, item_id, name, name_local, is_default"),
    supabase.from("items").select("id, name, name_local, sku, base_uom"),
    supabase.from("locations").select("id, name, name_local"),
  ]);
  const v = new Map((variants.data ?? []).map((x) => [x.id, x]));
  const i = new Map((items.data ?? []).map((x) => [x.id, x]));
  const l = new Map((locs.data ?? []).map((x) => [x.id, x]));
  const rows: LevelRow[] = (bal.data ?? []).flatMap((b) => {
    const variant = v.get(b.variant_id); const item = variant && i.get(variant.item_id); const loc = l.get(b.location_id);
    if (!variant || !item || !loc) return [];
    return [{
      key: `${b.location_id}:${b.variant_id}`, itemId: item.id, itemName: item.name, itemNameLocal: item.name_local, sku: item.sku, uom: item.base_uom,
      variantName: variant.is_default ? null : variant.name, variantNameLocal: variant.is_default ? null : variant.name_local,
      locationName: loc.name, locationNameLocal: loc.name_local, qty: Number(b.qty),
    }];
  });
  return <StockLevelsView rows={rows} failed={!!bal.error} />;
}
