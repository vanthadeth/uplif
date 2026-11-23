import { loadSession } from "@/lib/auth/session";
import { RolesView } from "./view";

export default async function RolesPage() {
  const { supabase, companyId, permissions } = await loadSession();
  // Everything is read as the signed-in user through row-level security. Permissions only decide what the page offers.
  const [roles, perms, apps, catalog, assigned, modules] = await Promise.all([
    supabase.from("roles").select("id, name, name_local, is_system").order("created_at"),
    supabase.from("role_permissions").select("role_id, permission_key, data_scope"),
    supabase.from("role_apps").select("role_id, app_key, allowed"),
    supabase.from("permissions").select("key, description, description_local").order("key"),
    supabase.from("membership_roles").select("role_id"),
    supabase.rpc("my_enabled_modules"),
  ]);
  const counts: Record<string, number> = {};
  (assigned.data ?? []).forEach((a) => { counts[a.role_id] = (counts[a.role_id] ?? 0) + 1; });
  return (
    <RolesView
      companyId={companyId ?? ""}
      roles={roles.data ?? []}
      permissions={perms.data ?? []}
      roleApps={apps.data ?? []}
      catalog={catalog.data ?? []}
      counts={counts}
      modules={modules.data ?? []}
      canManage={permissions.includes("org.role.manage")}
    />
  );
}
