import type { MessageKey } from "./messages";
import type { Json } from "./supabase/database.types";

const obj = (v: Json | undefined): { [k: string]: Json | undefined } | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;

/** Picks the sentence for an audit entry. `name` fills {name} when the entry carries one. Unknown actions fall back to the raw action. */
export function describeAction(action: string, details: Json): { key: MessageKey; name?: string } {
  const d = obj(details);
  const row = obj(d?.row);
  const next = obj(d?.new);
  if (action === "branches.insert") {
    return typeof row?.name === "string" ? { key: "db.act.branches.insert", name: row.name } : { key: "db.act.branches.insertAny" };
  }
  if (action === "memberships.update") {
    if (next?.status === "suspended") return { key: "db.act.memberships.suspended" };
    if (next?.status === "active") return { key: "db.act.memberships.active" };
    return { key: "db.act.memberships.update" };
  }
  if (action.startsWith("role_permissions.")) return { key: "db.act.role_permissions" };
  if (action.startsWith("role_apps.")) return { key: "db.act.role_apps" };
  const key = `db.act.${action}` as MessageKey;
  return { key: key in KNOWN ? key : "db.act.other" };
}

const KNOWN: Record<string, true> = {
  "db.act.invitation.create": true, "db.act.invitation.accept": true, "db.act.invitation.revoke": true,
  "db.act.company.create": true, "db.act.companies.update": true, "db.act.company_settings.update": true,
  "db.act.branches.update": true, "db.act.branches.delete": true,
  "db.act.roles.insert": true, "db.act.roles.update": true, "db.act.roles.delete": true,
  "db.act.membership_roles.insert": true, "db.act.membership_roles.delete": true,
};
