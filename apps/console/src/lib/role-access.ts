/**
 * App-first role access: a role is allowed or denied each app, then holds actions (permission keys) inside it.
 * The key-to-app rule mirrors app.app_of_permission() in the database; keep the two in step.
 */
export type Scope = "own" | "team" | "branch" | "company";
export const SCOPES: readonly Scope[] = ["own", "team", "branch", "company"];
export type AccessApp = "admin" | "time" | "go" | "orders" | "stock" | "pos" | "sites";
export const ACCESS_APPS: readonly AccessApp[] = ["admin", "time", "go", "orders", "stock", "pos", "sites"];
/** Plan module an app needs. Admin is core and has none. */
export const APP_MODULE: Record<AccessApp, string | null> = {
  admin: null, time: "attendance", go: "field_sales", orders: "invoice", stock: "inventory", pos: "pos", sites: "projects_sites",
};

/** Which app owns a permission key; null for keys every app needs (branch read) and keys of no app. */
export function appOfPermission(key: string): AccessApp | null {
  if (key === "org.branch.read") return null;
  if (/^(org|leave|learn|performance|career)\./.test(key)) return "admin";
  if (key.startsWith("attendance.")) return "time";
  if (key.startsWith("sales.")) return "go";
  if (key.startsWith("orders.")) return "orders";
  if (key.startsWith("stock.")) return "stock";
  if (key.startsWith("pos.")) return "pos";
  if (key.startsWith("sites.")) return "sites";
  return null;
}

/** Only these read actions can be limited to own records, team or branches; every other action is all or nothing. */
export const SCOPED_KEYS: ReadonlySet<string> = new Set(["org.branch.read", "org.member.read", "org.role.read", "org.employee.read"]);
export const isRead = (key: string) => key.endsWith(".read");

/** The app a key is listed under on screen. Branch read has no owner app, but is shown in Admin and always allowed. */
export const displayApp = (key: string): AccessApp | null => appOfPermission(key) ?? (key === "org.branch.read" ? "admin" : null);

export interface GroupDef { id: string; app: AccessApp; labelKey: string; resources: string[] }
/** The groups an app's actions are shown in, by the second part of the key. */
export const GROUPS: readonly GroupDef[] = [
  { id: "company", app: "admin", labelKey: "roles.group.company", resources: ["company", "settings", "currency", "payment_term"] },
  { id: "branch", app: "admin", labelKey: "roles.group.branch", resources: ["branch"] },
  { id: "people", app: "admin", labelKey: "roles.group.people", resources: ["member", "invitation", "employee", "department", "position"] },
  { id: "roles", app: "admin", labelKey: "ra.group.rolesAudit", resources: ["role", "audit"] },
  { id: "growth", app: "admin", labelKey: "ra.group.growth", resources: ["request", "type", "policy", "test", "result", "playbook", "kpi", "review", "record"] },
  { id: "attendance", app: "time", labelKey: "ra.group.attendance", resources: ["clock", "record", "selfie", "amendment", "settings"] },
  { id: "schedules", app: "time", labelKey: "ra.group.schedules", resources: ["schedule", "holiday"] },
  { id: "customers", app: "go", labelKey: "ra.group.customers", resources: ["customer"] },
  { id: "visits", app: "go", labelKey: "ra.group.visits", resources: ["visit"] },
  { id: "orders", app: "orders", labelKey: "ra.group.orders", resources: ["order", "invoice", "payment"] },
  { id: "items", app: "stock", labelKey: "ra.group.items", resources: ["item", "level"] },
];

/** The group a key belongs to inside its app, or null when it has none. */
export function groupOf(key: string): GroupDef | null {
  const app = displayApp(key);
  const resource = key.split(".")[1] ?? "";
  return GROUPS.find((g) => g.app === app && g.resources.includes(resource)) ?? null;
}

export type Perms = Record<string, Scope>;
export type Apps = Record<AccessApp, boolean>;
export interface Draft { apps: Apps; perms: Perms }

export const emptyDraft = (): Draft => ({ apps: Object.fromEntries(ACCESS_APPS.map((a) => [a, false])) as Apps, perms: {} });

/**
 * A role's draft from the database. A missing app row means allowed (as the database treats it), but for display
 * an app a role holds no actions in counts as denied, so older roles read the way they behave.
 */
export function draftFrom(rows: { app_key: string; allowed: boolean }[], perms: { permission_key: string; data_scope: Scope }[], isOwnerRole: boolean): Draft {
  const d = emptyDraft();
  for (const p of perms) d.perms[p.permission_key] = p.data_scope;
  for (const a of ACCESS_APPS) {
    const row = rows.find((r) => r.app_key === a);
    const holds = Object.keys(d.perms).some((k) => appOfPermission(k) === a);
    d.apps[a] = isOwnerRole ? true : row ? row.allowed : holds;
  }
  return d;
}

export type Level = "none" | "view" | "full" | "custom";
export interface GroupLevel { level: Level; scope?: Scope; on: number; total: number }

/** How much of a group a draft allows. "view" = reads only; "full" = every action at company scope. */
export function groupLevel(keys: string[], perms: Perms): GroupLevel {
  const on = keys.filter((k) => perms[k]);
  const total = keys.length;
  if (!on.length) return { level: "none", on: 0, total };
  if (on.length === total && on.every((k) => perms[k] === "company")) return { level: "full", on: on.length, total };
  if (on.every((k) => isRead(k))) {
    const widest = SCOPES[Math.max(...on.map((k) => SCOPES.indexOf(perms[k])))];
    if (on.length === keys.filter(isRead).length) return { level: "view", scope: widest, on: on.length, total };
  }
  return { level: "custom", on: on.length, total };
}

/** Quick set for one group: none removes everything, view keeps or sets reads and removes the rest, full sets all to company. */
export function applyPreset(keys: string[], perms: Perms, mode: "none" | "view" | "full"): Perms {
  const next = { ...perms };
  for (const k of keys) {
    if (mode === "none") delete next[k];
    else if (mode === "full") next[k] = "company";
    else if (isRead(k)) next[k] = next[k] ?? "company";
    else delete next[k];
  }
  return next;
}

/** Number of apps and actions that differ between two drafts. */
export function changeCount(a: Draft, b: Draft): number {
  let n = ACCESS_APPS.filter((k) => a.apps[k] !== b.apps[k]).length;
  const keys = new Set([...Object.keys(a.perms), ...Object.keys(b.perms)]);
  keys.forEach((k) => { if (a.perms[k] !== b.perms[k]) n++; });
  return n;
}

/** What to send to save_role_access: every app as allowed or not, and the complete list of actions the role holds. */
export function savePayload(d: Draft): { apps: Record<string, boolean>; perms: Perms } {
  return { apps: { ...d.apps }, perms: { ...d.perms } };
}
