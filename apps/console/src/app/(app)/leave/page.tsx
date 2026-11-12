import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { LeaveView, type LeaveRequestRow, type LeaveTypeRow } from "./view";

export default async function LeavePage() {
  const { supabase, permissions } = await loadSession();
  const canReview = permissions.includes("leave.request.review");
  const canManage = permissions.includes("leave.type.manage");
  if (!canReview && !canManage) redirect("/dashboard");

  // Read as the signed-in user. The database limits requests to the people this user may review.
  const [pending, approved, rejected, types] = await Promise.all([
    canReview ? supabase.rpc("leave_review_list", { p_status: "pending" }) : null,
    canReview ? supabase.rpc("leave_review_list", { p_status: "approved" }) : null,
    canReview ? supabase.rpc("leave_review_list", { p_status: "rejected" }) : null,
    supabase.from("leave_types").select("id, code, name, name_local, paid, annual_days, active").order("code"),
  ]);
  const rows = (r: typeof pending) => ((r?.data ?? []) as LeaveRequestRow[]);
  return (
    <LeaveView canReview={canReview} canManage={canManage}
      requests={{ pending: rows(pending), approved: rows(approved).slice().reverse(), rejected: rows(rejected).slice().reverse() }}
      types={(types.data ?? []) as LeaveTypeRow[]} />
  );
}
