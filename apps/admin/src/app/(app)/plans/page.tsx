import { loadPlatform } from "@/lib/platform";
import { PlansView } from "./view";

export default async function PlansPage() {
  const { supabase } = await loadPlatform();
  const { data, error } = await supabase.rpc("platform_list_plans");
  return <PlansView plans={data ?? []} failed={!!error} />;
}
