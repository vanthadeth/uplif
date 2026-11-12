import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { PerformanceView, type KpiRow, type PositionRow } from "./view";

export default async function PerformancePage() {
  const { supabase, permissions } = await loadSession();
  const canReview = permissions.includes("performance.review.write");
  const canManage = permissions.includes("performance.kpi.manage");
  if (!canReview && !canManage) redirect("/dashboard");

  // KPIs and positions are read as the signed-in user through row-level security. Reviews load in the page by month.
  const [kpis, positions] = await Promise.all([
    canManage ? supabase.from("kpis").select("id, position_id, name, name_local, weight, active").order("created_at") : null,
    canManage ? supabase.from("positions").select("id, name, name_local").eq("is_active", true).order("name") : null,
  ]);
  return <PerformanceView canReview={canReview} canManage={canManage} kpis={(kpis?.data ?? []) as KpiRow[]} positions={(positions?.data ?? []) as PositionRow[]} />;
}
