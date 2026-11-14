import { loadSession } from "@/lib/auth/session";
import { CompanyForm } from "./form";

export default async function CompanyPage() {
  const { supabase, permissions } = await loadSession();
  // Everything is read and written as the signed-in user, so RLS decides. Permissions only decide what the page offers.
  const [{ data: company }, { data: settings }, { data: currencies }, { data: mine }] = await Promise.all([
    supabase.from("companies").select("id, name, name_local, country_code").maybeSingle(),
    supabase.from("company_settings").select("cross_branch_stock_visibility, attendance_selfie_retention_days").maybeSingle(),
    supabase.from("company_currencies").select("code, is_home").order("code"),
    supabase.rpc("list_my_companies"),
  ]);
  const can = (k: string) => permissions.includes(k);
  return (
    <CompanyForm
      company={company}
      settings={settings}
      currencies={currencies ?? []}
      canProfile={can("org.company.update")}
      canSettings={can("org.settings.update")}
      canCurrency={can("org.currency.manage")}
      canDelete={!!company && !!mine?.some((c: { company_id: string; is_owner: boolean }) => c.company_id === company.id && c.is_owner)}
    />
  );
}
