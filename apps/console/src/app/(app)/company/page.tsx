import { loadSession } from "@/lib/auth/session";
import { CompanyForm } from "./form";

export default async function CompanyPage() {
  const { supabase } = await loadSession();
  const [{ data: company }, { data: settings }, { data: currencies }] = await Promise.all([
    supabase.from("companies").select("id, name, name_local, country_code").maybeSingle(),
    supabase.from("company_settings").select("cross_branch_stock_visibility, attendance_selfie_retention_days").maybeSingle(),
    supabase.from("company_currencies").select("code, is_home").order("code"),
  ]);
  return <CompanyForm company={company} settings={settings} homeCurrency={currencies?.find((c) => c.is_home)?.code ?? ""} />;
}
