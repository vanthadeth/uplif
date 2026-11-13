import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { CareerView, type DescRow, type EventRow, type PersonRow, type PositionRow } from "./view";

export default async function CareerPage() {
  const { supabase, permissions } = await loadSession();
  if (!permissions.includes("career.record.manage")) redirect("/dashboard");

  // Everything is read as the signed-in user through row-level security.
  const [positions, descriptions, events, people] = await Promise.all([
    supabase.from("positions").select("id, name, name_local").eq("is_active", true).order("name"),
    supabase.from("position_descriptions").select("position_id, summary, summary_local, duties, duties_local"),
    supabase.from("career_events").select("id, employee_id, kind, event_date, from_name, from_name_local, to_name, to_name_local, note").order("event_date", { ascending: false }).limit(200),
    supabase.from("employees").select("id, name, name_local, position_id, status").order("name"),
  ]);
  return <CareerView positions={(positions.data ?? []) as PositionRow[]} descriptions={(descriptions.data ?? []) as DescRow[]}
    events={(events.data ?? []) as EventRow[]} people={(people.data ?? []) as PersonRow[]} />;
}
