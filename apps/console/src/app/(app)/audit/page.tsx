import { loadSession } from "@/lib/auth/session";
import { AuditView } from "./view";

const PAGE = 25;
const day = /^\d{4}-\d{2}-\d{2}$/;
const uuid = /^[0-9a-f-]{36}$/;
const ranges = ["today", "7", "30", "cus"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, permissions } = await loadSession();
  const canView = permissions.includes("org.audit.read");
  const entity = sp.entity && /^[a-z_]+$/.test(sp.entity) ? sp.entity : "";
  const who = sp.who === "sys" || (sp.who && uuid.test(sp.who)) ? sp.who : "";
  const range = sp.range && ranges.includes(sp.range) ? sp.range : "";
  const from = range === "cus" && sp.from && day.test(sp.from) ? sp.from : "";
  const to = range === "cus" && sp.to && day.test(sp.to) ? sp.to : "";
  const count = Math.min(Math.max(Number(sp.n) || PAGE, PAGE), 500);

  const [members, branches, roles] = await Promise.all([
    supabase.from("memberships").select("id, display_name").order("display_name"),
    supabase.from("branches").select("id, name, name_local"),
    supabase.from("roles").select("id, name, name_local"),
  ]);

  let rows: { id: string; created_at: string; membership_id: string | null; action: string; entity_type: string; entity_id: string | null; details: import("@/lib/supabase/database.types").Json }[] = [];
  let hasMore = false;
  if (canView) {
    let q = supabase.from("audit_log")
      .select("id, created_at, membership_id, action, entity_type, entity_id, details")
      .order("created_at", { ascending: false })
      .limit(count + 1);
    if (entity) q = q.eq("entity_type", entity);
    if (who === "sys") q = q.is("membership_id", null);
    else if (who) q = q.eq("membership_id", who);
    if (range === "today" || range === "7" || range === "30") {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - (range === "today" ? 0 : Number(range) - 1));
      q = q.gte("created_at", d.toISOString());
    }
    if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
    if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`);
    const { data } = await q;
    const list = data ?? [];
    hasMore = list.length > count;
    rows = list.slice(0, count);
  }

  // Names for ids that show up in entries and details, looked up here so the page can show words, not uuids.
  const names: Record<string, { name: string; local: string | null }> = {};
  for (const m of members.data ?? []) names[m.id] = { name: m.display_name ?? "—", local: null };
  for (const b of branches.data ?? []) names[b.id] = { name: b.name, local: b.name_local };
  for (const r of roles.data ?? []) names[r.id] = { name: r.name, local: r.name_local };

  return (
    <AuditView
      canView={canView}
      rows={rows}
      hasMore={hasMore}
      count={count}
      pageSize={PAGE}
      members={(members.data ?? []).map((m) => ({ id: m.id, display_name: m.display_name }))}
      names={names}
      filters={{ entity, who: who ?? "", range, from, to }}
    />
  );
}
