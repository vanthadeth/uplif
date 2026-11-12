import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { todayIn } from "@/lib/working-time";
import { TimeAndLeave } from "./time";

export default async function EmployeeTimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, permissions } = await loadSession();
  const can = (k: string) => permissions.includes(k);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Row-level security decides whether this employee is visible to the caller at all.
  const { data: employee } = await supabase.from("employees")
    .select("id, name, name_local, branch_id, department_id").eq("id", id).maybeSingle();
  if (!employee) notFound();
  const { data: settings } = await supabase.from("company_settings").select("timezone").maybeSingle();
  const today = todayIn(settings?.timezone ?? "Asia/Phnom_Penh");
  const canManage = can("attendance.schedule.manage");
  const none = Promise.resolve({ data: [] });
  const [week, schedules, branches, departments] = await Promise.all([
    supabase.rpc("employee_work_days", { p_employee_id: id, p_from: today, p_days: 14 }),
    supabase.from("work_schedules").select("id, name, name_local, is_active").order("name"),
    can("org.branch.read") ? supabase.from("branches").select("id, name, name_local").order("name") : none,
    supabase.from("departments").select("id, name, name_local").order("name"),
  ]);
  return (
    <TimeAndLeave
      employee={employee}
      week={week.error ? null : week.data ?? []}
      today={today}
      canManage={canManage}
      schedules={(schedules.data ?? []).filter((s) => s.is_active)}
      allSchedules={schedules.data ?? []}
      branches={branches.data ?? []}
      departments={departments.data ?? []}
    />
  );
}
