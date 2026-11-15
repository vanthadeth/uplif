import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface TimeState {
  userId: string;
  companyId: string;
  companyName: string;
  companyNameLocal: string | null;
  /** The company's plan includes Attendance, which Time is built on. */
  module: boolean;
  /** Time is for people who may read other people's attendance: team, branch or company scope. */
  canLook: boolean;
  /** May give or take leave days (leave.allowance.manage, company scope). */
  canGiveLeave: boolean;
  /** Pay permissions, always company scope (payroll.terms.view / .manage / payroll.settings.manage). */
  canViewPay: boolean;
  canManagePay: boolean;
  canPaySettings: boolean;
  /** Payslips: see runs and drafts (view or prepare), prepare them, open runs. */
  canSlips: boolean;
  canPrepare: boolean;
  canRuns: boolean;
}

/** The signed-in person's company, plan and attendance scope. Cached for one request so the layout and pages share it. */
export const getTimeState = cache(async (): Promise<TimeState | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const companyId = (data?.claims?.app_metadata as { company_id?: string } | undefined)?.company_id;
  const userId = data?.claims?.sub;
  if (!companyId || !userId) return null;
  const [mods, perms, companies] = await Promise.all([
    supabase.rpc("my_enabled_modules"), supabase.rpc("my_permissions"), supabase.rpc("list_my_companies"),
  ]);
  const company = companies.data?.find((c) => c.company_id === companyId);
  if (!company) return null;
  const scope = (perms.data ?? []).find((p) => p.permission_key === "attendance.record.read")?.data_scope;
  const company$ = (key: string) => (perms.data ?? []).some((p) => p.permission_key === key && p.data_scope === "company");
  return {
    userId, companyId, companyName: company.name, companyNameLocal: company.name_local,
    module: (mods.data ?? []).includes("attendance"),
    canLook: !!scope && scope !== "own",
    canGiveLeave: company$("leave.allowance.manage"),
    canViewPay: company$("payroll.terms.view"),
    canManagePay: company$("payroll.terms.manage"),
    canPaySettings: company$("payroll.settings.manage"),
    canSlips: company$("payroll.payslip.view") || company$("payroll.payslip.prepare"),
    canPrepare: company$("payroll.payslip.prepare"),
    canRuns: company$("payroll.run.manage"),
  };
});
