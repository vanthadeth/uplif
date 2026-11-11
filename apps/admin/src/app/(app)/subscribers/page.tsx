import { loadPlatform } from "@/lib/platform";
import { SubscribersView } from "./view";

export default async function SubscribersPage() {
  const { supabase } = await loadPlatform();
  const [subs, plans] = await Promise.all([supabase.rpc("platform_list_subscribers"), supabase.rpc("platform_list_plans")]);
  return <SubscribersView subscribers={subs.data ?? []} plans={plans.data ?? []} failed={!!subs.error || !!plans.error} />;
}
