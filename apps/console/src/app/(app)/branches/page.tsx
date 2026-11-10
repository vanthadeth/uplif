import { loadSession } from "@/lib/auth/session";
import { BranchList } from "./list";

export default async function BranchesPage() {
  const { supabase, companyId } = await loadSession();
  const { data } = await supabase.from("branches").select("id, name, name_local, is_active").order("created_at");
  return <BranchList branches={data ?? []} companyId={companyId ?? ""} />;
}
