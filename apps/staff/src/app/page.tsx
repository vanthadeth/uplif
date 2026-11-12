import { createClient } from "@/lib/supabase/server";
import { Clock } from "./clock";
import { NoAccess } from "./no-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: state, error } = await supabase.rpc("attendance_my_state");
  if (error || !state || !state.linked) return <NoAccess kind="access" />;
  if (!state.module) return <NoAccess kind="module" />;
  const { data: recent } = await supabase
    .from("attendance_events")
    .select("id, kind, occurred_at, flags")
    .eq("employee_id", state.employee_id!)
    .order("occurred_at", { ascending: false })
    .limit(10);
  return <Clock initial={state} recent={recent ?? []} />;
}
