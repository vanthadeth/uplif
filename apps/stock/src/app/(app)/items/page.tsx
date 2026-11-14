import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { ItemsView } from "@/components/items-view";
import { parseProperties } from "@/components/item-properties";
import type { ItemImage } from "@/components/item-pictures";
import type { Variant } from "@/components/item-variants";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const [items, categories, brands, home, pics, vars] = await Promise.all([
    supabase.from("items").select("id, sku, name, name_local, description, description_local, category_id, brand_id, base_uom, packs, properties, price, currency_code, is_active").order("name"),
    supabase.from("categories").select("id, parent_id, name, name_local, is_active").order("name"),
    supabase.from("brands").select("id, name, name_local, is_active").order("name"),
    supabase.from("company_currencies").select("code").eq("is_home", true).maybeSingle(),
    supabase.from("item_images").select("id, item_id, image_path, is_main").order("created_at"),
    supabase.from("item_variants").select("id, item_id, name, name_local, sku, barcode, price, image_id, is_default, is_active").order("created_at"),
  ]);
  // Pictures are private; each gets a link that works for an hour.
  const rows = pics.data ?? [];
  const signed = rows.length ? (await supabase.storage.from("stock-images").createSignedUrls(rows.map((r) => r.image_path), 3600)).data ?? [] : [];
  const urls = new Map(signed.map((x) => [x.path, x.signedUrl]));
  const images: ItemImage[] = rows.map((r) => ({ ...r, url: urls.get(r.image_path) ?? null }));
  return (
    <ItemsView
      items={(items.data ?? []).map((i) => ({ ...i, packs: Array.isArray(i.packs) ? (i.packs as unknown as { name: string; qty: number }[]) : [], properties: parseProperties(i.properties) }))}
      images={images} variants={(vars.data ?? []) as Variant[]} categories={categories.data ?? []} brands={brands.data ?? []}
      currency={home.data?.code ?? "USD"} failed={!!items.error}
      companyId={state!.companyId} canManage={state!.canManage}
    />
  );
}
