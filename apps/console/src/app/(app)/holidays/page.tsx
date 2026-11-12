import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { todayIn } from "@/lib/working-time";
import { HolidaysView } from "./view";

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const { supabase, permissions } = await loadSession();
  const can = (k: string) => permissions.includes(k);
  if (!can("attendance.holiday.read") && !can("attendance.holiday.manage")) redirect("/dashboard");
  const canManage = can("attendance.holiday.manage");
  const { import: importYear } = await searchParams;
  const none = Promise.resolve({ data: [] });

  // Read as the signed-in user through row-level security. Presets are only needed for the import dialog.
  const [settings, company, holidays, branches, notice] = await Promise.all([
    supabase.from("company_settings").select("timezone").maybeSingle(),
    supabase.from("companies").select("country_code").maybeSingle(),
    supabase.from("company_holidays").select("id, name, name_local, holiday_date, repeats_yearly, observed_date, branch_id, provisional, source").order("holiday_date"),
    can("org.branch.read") ? supabase.from("branches").select("id, name, name_local").order("name") : none,
    canManage ? supabase.rpc("holiday_notice") : none,
  ]);
  const timezone = settings.data?.timezone ?? "Asia/Phnom_Penh";
  const country = company.data?.country_code ?? "";
  const today = todayIn(timezone);
  const year = Number(today.slice(0, 4));

  // Presets for this and next year in the company's country.
  const presetRows = canManage && country
    ? (await supabase.from("holiday_presets").select("holiday_date, name, name_local, provisional").eq("country_code", country)
        .gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year + 1}-12-31`).order("holiday_date")).data ?? []
    : [];
  const pendingNotice = (notice.data as { year: number; holiday_count: number; provisional: boolean }[] | null)?.[0] ?? null;

  return (
    <HolidaysView
      canManage={canManage} today={today} country={country}
      holidays={holidays.data ?? []} branches={branches.data ?? []} presets={presetRows}
      notice={pendingNotice} openImport={importYear ? Number(importYear) : null}
    />
  );
}
