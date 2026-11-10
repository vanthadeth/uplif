import { loadSession } from "@/lib/auth/session";
import { RolesView } from "./view";

export default async function RolesPage() {
  const { supabase, companyId } = await loadSession();
  const [roles, perms, catalog, assigned] = await Promise.all([
    supabase.from("roles").select("id, name, name_local, is_system").order("created_at"),
    supabase.from("role_permissions").select("role_id, permission_key, data_scope"),
    supabase.from("permissions").select("key, description").order("key"),
    supabase.from("membership_roles").select("role_id"),
  ]);
  const counts: Record<string, number> = {};
  (assigned.data ?? []).forEach((a) => { counts[a.role_id] = (counts[a.role_id] ?? 0) + 1; });
  return (
    <RolesView
      companyId={companyId ?? ""}
      roles={roles.data ?? []}
      permissions={perms.data ?? []}
      catalog={catalog.data ?? []}
      counts={counts}
    />
  );
}
