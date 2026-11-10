import { loadSession } from "@/lib/auth/session";
import { AuditView } from "./view";

const PAGE = 25;
const day = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await loadSession();
  const entity = sp.entity && /^[a-z_]+$/.test(sp.entity) ? sp.entity : "";
  const from = sp.from && day.test(sp.from) ? sp.from : "";
  const to = sp.to && day.test(sp.to) ? sp.to : "";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : "";

  let q = supabase.from("audit_log")
    .select("id, created_at, membership_id, action, entity_type, entity_id, details")
    .order("created_at", { ascending: false })
    .limit(PAGE + 1);
  if (entity) q = q.eq("entity_type", entity);
  if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`);
  if (before) q = q.lt("created_at", before);

  const [{ data: rows }, { data: members }] = await Promise.all([q, supabase.from("memberships").select("id, display_name")]);
  const list = rows ?? [];
  return (
    <AuditView
      rows={list.slice(0, PAGE)}
      hasMore={list.length > PAGE}
      members={members ?? []}
      filters={{ entity, from, to }}
      isFirstPage={!before}
    />
  );
}
