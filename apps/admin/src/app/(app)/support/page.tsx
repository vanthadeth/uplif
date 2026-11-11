import { loadPlatform } from "@/lib/platform";
import { SupportView } from "./view";

export default async function SupportPage() {
  const { supabase } = await loadPlatform();
  const { data, error } = await supabase.rpc("platform_list_support_grants");
  return <SupportView grants={data ?? []} failed={!!error} />;
}
