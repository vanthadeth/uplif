import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { LocationsView } from "@/components/locations-view";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const [{ data, error }, branches] = await Promise.all([
    supabase.from("locations").select("id, name, name_local, address, note, is_active, branch_id").order("name"),
    supabase.from("branches").select("id, name, name_local").eq("is_active", true).order("name"),
  ]);
  return <LocationsView locations={data ?? []} branches={branches.data ?? []} failed={!!error} companyId={state!.companyId} canManage={state!.canManage} />;
}
