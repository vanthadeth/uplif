import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { CategoriesView, type Category } from "@/components/categories-view";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const { data, error } = await supabase.from("categories").select("id, parent_id, name, name_local, image_path, is_active").order("name");
  const rows = data ?? [];
  // Pictures are private; each gets a link that works for an hour.
  const paths = rows.map((c) => c.image_path).filter((p): p is string => !!p);
  const signed = paths.length ? (await supabase.storage.from("stock-images").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const categories: Category[] = rows.map((c) => ({ ...c, image_url: c.image_path ? urls.get(c.image_path) ?? null : null }));
  return <CategoriesView categories={categories} failed={!!error} companyId={state!.companyId} canManage={state!.canManage} />;
}
