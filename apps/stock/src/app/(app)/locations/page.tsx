import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { LocationsView } from "@/components/locations-view";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const { data, error } = await supabase.from("locations").select("id, name, name_local, address, note, is_active").order("name");
  return <LocationsView locations={data ?? []} failed={!!error} companyId={state!.companyId} canManage={state!.canManage} />;
}
