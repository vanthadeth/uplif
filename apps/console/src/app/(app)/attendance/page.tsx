import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { AttendanceSettingsView } from "./view";

export default async function AttendancePage() {
  const { supabase, permissions } = await loadSession();
  if (!permissions.includes("attendance.settings.manage")) redirect("/dashboard");
  const { data } = await supabase.rpc("get_attendance_settings");
  if (!data) redirect("/dashboard");
  return <AttendanceSettingsView settings={data} />;
}
