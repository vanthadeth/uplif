import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { SuppliersView } from "@/components/suppliers-view";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const { data, error } = await supabase.from("suppliers").select("id, name, name_local, contact_name, phone, email, address, note, is_active").order("name");
  return <SuppliersView suppliers={data ?? []} failed={!!error} companyId={state!.companyId} canManage={state!.canManage} />;
}
