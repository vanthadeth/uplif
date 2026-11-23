import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { BrandsView, type Brand } from "@/components/brands-view";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const { data, error } = await supabase.from("brands").select("id, name, name_local, image_path, is_active").order("name");
  const rows = data ?? [];
  // Pictures are private; each gets a link that works for an hour.
  const paths = rows.map((b) => b.image_path).filter((p): p is string => !!p);
  const signed = paths.length ? (await supabase.storage.from("stock-images").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const brands: Brand[] = rows.map((b) => ({ ...b, image_url: b.image_path ? urls.get(b.image_path) ?? null : null }));
  return <BrandsView brands={brands} failed={!!error} companyId={state!.companyId} canManage={state!.canManage} />;
}
