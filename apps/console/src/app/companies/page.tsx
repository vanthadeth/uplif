import { requireStep } from "@/lib/auth/session";
import { Picker } from "./picker";

export default async function CompaniesPage() {
  const { supabase } = await requireStep("/companies");
  const { data } = await supabase.rpc("list_my_companies");
  return <Picker companies={data ?? []} />;
}
