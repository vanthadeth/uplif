import { loadPlatform } from "@/lib/platform";
import { BillingView } from "./view";

export default async function BillingPage() {
  const { supabase } = await loadPlatform();
  const { data, error } = await supabase.rpc("platform_list_invoices");
  return <BillingView invoices={data ?? []} failed={!!error} />;
}
