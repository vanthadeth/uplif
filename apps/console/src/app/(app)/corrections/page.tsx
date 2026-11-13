import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { CorrectionsView, type CorrectionRow } from "./view";

export default async function CorrectionsPage() {
  const { supabase, permissions } = await loadSession();
  if (!permissions.includes("attendance.amendment.review")) redirect("/dashboard");

  // Read as the signed-in user. The database limits requests to the people this user may review.
  const [pending, approved, rejected] = await Promise.all([
    supabase.rpc("amendment_review_list", { p_status: "pending" }),
    supabase.rpc("amendment_review_list", { p_status: "approved" }),
    supabase.rpc("amendment_review_list", { p_status: "rejected" }),
  ]);
  const rows = (r: typeof pending) => (r.data ?? []) as CorrectionRow[];
  return <CorrectionsView requests={{ pending: rows(pending), approved: rows(approved).slice().reverse(), rejected: rows(rejected).slice().reverse() }} />;
}
