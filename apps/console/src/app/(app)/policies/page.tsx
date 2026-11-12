import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { PoliciesView, type PolicyRow } from "./view";

export default async function PoliciesPage() {
  const { supabase, permissions } = await loadSession();
  if (!permissions.includes("learn.policy.manage")) redirect("/dashboard");

  // Read as the signed-in user through row-level security.
  const [policies, versions] = await Promise.all([
    supabase.from("company_policies").select("id, title, title_local, archived, updated_at").order("created_at", { ascending: false }),
    supabase.from("policy_versions").select("policy_id, version, body, body_local, published_at").order("version", { ascending: false }),
  ]);
  const latest = new Map<string, { version: number; body: string; body_local: string | null; published_at: string }>();
  for (const v of versions.data ?? []) if (!latest.has(v.policy_id)) latest.set(v.policy_id, v);

  const rows: PolicyRow[] = await Promise.all((policies.data ?? []).map(async (p) => {
    const v = latest.get(p.id);
    const { data } = await supabase.rpc("policy_ack_status", { p_policy_id: p.id });
    const people = (data ?? []) as { employee_id: string; name: string; name_local: string | null; acknowledged_at: string | null }[];
    return {
      id: p.id, title: p.title, title_local: p.title_local, archived: p.archived,
      version: v?.version ?? 1, body: v?.body ?? "", body_local: v?.body_local ?? null, published_at: v?.published_at ?? p.updated_at, people,
    };
  }));

  return <PoliciesView rows={rows} />;
}
