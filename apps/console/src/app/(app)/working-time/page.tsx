import { loadSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { todayIn } from "@/lib/working-time";
import { WorkSetupCard } from "@/components/work-setup-card";
import { WorkingTimeView } from "./view";

export default async function WorkingTimePage() {
  const { supabase, companyId, permissions } = await loadSession();
  const can = (k: string) => permissions.includes(k);
  if (!can("attendance.schedule.read") && !can("attendance.schedule.manage")) redirect("/dashboard");
  const canManage = can("attendance.schedule.manage");
  const none = Promise.resolve({ data: [] });

  // Everything is read as the signed-in user through row-level security. Names of branches, departments and employees
  // are only needed to assign schedules, so they are only read for people who may.
  const [settings, schedules, versions, days, weekHours, assignments, branches, departments, employees] = await Promise.all([
    supabase.from("company_settings").select("timezone, work_setup_done").maybeSingle(),
    supabase.from("work_schedules").select("id, name, name_local, is_active").order("name"),
    supabase.from("work_schedule_versions").select("id, schedule_id, valid_from, grace_late_min, grace_early_min, earliest_clock_in_min, half_day_late_min, overtime_after_min, overtime_needs_approval"),
    supabase.from("work_schedule_days").select("version_id, weekday, day_kind, start_time, end_time, break_min"),
    supabase.rpc("work_schedule_week_hours"),
    supabase.from("work_schedule_assignments").select("id, scope, target_id, schedule_id, effective_from").order("effective_from", { ascending: false }),
    can("org.branch.read") ? supabase.from("branches").select("id, name, name_local").order("name") : none,
    supabase.from("departments").select("id, name, name_local").order("name"),
    can("org.employee.read") ? supabase.from("employees").select("id, name, name_local").neq("status", "left").order("name") : none,
  ]);
  const timezone = settings.data?.timezone ?? "Asia/Phnom_Penh";
  const setupDone = settings.data?.work_setup_done ?? false;

  return (
    <div className="flex flex-col gap-5">
      {canManage && !setupDone && (schedules.data ?? []).length === 0 && <WorkSetupCard />}
      <WorkingTimeView
        companyId={companyId ?? ""}
        canManage={canManage}
        timezone={timezone}
        today={todayIn(timezone)}
        schedules={schedules.data ?? []}
        versions={versions.data ?? []}
        days={days.data ?? []}
        weekHours={Object.fromEntries((weekHours.data ?? []).map((w) => [w.version_id, Number(w.hours)]))}
        assignments={assignments.data ?? []}
        branches={branches.data ?? []}
        departments={departments.data ?? []}
        employees={employees.data ?? []}
      />
    </div>
  );
}
