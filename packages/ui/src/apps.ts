/**
 * The UPLIF app registry: one list of every app, used by the welcome screens now and by the app switcher later.
 * An app is shown to a person only when it is built, the company's plan includes its module, and the person has
 * a permission that lets them use it. Names are display names; keys never change.
 */
// Next.js replaces process.env.NEXT_PUBLIC_* at build time; this package does not depend on Node types.
declare const process: { env: Record<string, string | undefined> };

export type AppKey = "me" | "admin" | "time" | "go" | "orders" | "stock" | "pos" | "sites";

export interface AppInfo {
  key: AppKey;
  name: string;
  /** English fallback for the one-line description; apps pass translated text through `blurbKey`. */
  blurb: string;
  blurbKey: string;
  /** Where the app lives. Each URL can be overridden at build time with the env var in `urlEnv`. */
  url: string;
  /** Plan module that must be on for the company, if any. */
  module?: string;
  /** The person needs at least one of these permissions, if any. */
  permissionsAny?: string[];
  /** False until the app exists, so it is never offered. */
  built: boolean;
  /** Which plan unlocks the module: Premium includes it, or it is bought as an add-on. Shown on a locked app. */
  tier?: "premium" | "addon";
}

const adminPermissions = [
  "org.company.update", "org.settings.update", "org.member.update", "org.role.manage", "org.invitation.manage", "org.branch.update",
];

export const APPS: AppInfo[] = [
  { key: "me", name: "UPLIF Me", blurb: "Your profile and work record", blurbKey: "app.me.blurb", built: true,
    url: process.env.NEXT_PUBLIC_URL_ME ?? "https://uplif-me.vercel.app" },
  { key: "admin", name: "UPLIF Admin", blurb: "Set up your company and people", blurbKey: "app.admin.blurb", built: true,
    permissionsAny: adminPermissions,
    url: process.env.NEXT_PUBLIC_URL_ADMIN ?? "https://uplif-console.vercel.app" },
  { key: "time", tier: "premium", name: "UPLIF Time", blurb: "Clock in and attendance", blurbKey: "app.time.blurb", built: false, module: "attendance",
    url: process.env.NEXT_PUBLIC_URL_TIME ?? "" },
  { key: "go", tier: "addon", name: "UPLIF Go", blurb: "Customer visits and notes", blurbKey: "app.go.blurb", built: true, module: "field_sales",
    permissionsAny: ["sales.customer.read"],
    url: process.env.NEXT_PUBLIC_URL_GO ?? "https://uplif-go.vercel.app" },
  { key: "orders", tier: "premium", name: "UPLIF Orders", blurb: "Orders, invoices and payments", blurbKey: "app.orders.blurb", built: false, module: "invoice",
    url: process.env.NEXT_PUBLIC_URL_ORDERS ?? "" },
  { key: "stock", tier: "premium", name: "UPLIF Stock", blurb: "Items and stock levels", blurbKey: "app.stock.blurb", built: true, module: "inventory",
    permissionsAny: ["stock.catalog.read", "stock.catalog.manage"],
    url: process.env.NEXT_PUBLIC_URL_STOCK ?? "https://uplif-stock.vercel.app" },
  { key: "pos", tier: "addon", name: "UPLIF POS", blurb: "Sell at the counter", blurbKey: "app.pos.blurb", built: false, module: "pos",
    url: process.env.NEXT_PUBLIC_URL_POS ?? "" },
  { key: "sites", tier: "addon", name: "UPLIF Sites", blurb: "Jobs, sites and teams", blurbKey: "app.sites.blurb", built: false, module: "projects_sites",
    url: process.env.NEXT_PUBLIC_URL_SITES ?? "" },
];

/** The apps one person can use in one company. `modules` and `permissions` come from the database. */
export function visibleApps(modules: readonly string[], permissions: readonly string[], apps: readonly AppInfo[] = APPS): AppInfo[] {
  const mods = new Set(modules);
  const perms = new Set(permissions);
  return apps.filter((a) =>
    a.built && !!a.url &&
    (!a.module || mods.has(a.module)) &&
    (!a.permissionsAny || a.permissionsAny.some((p) => perms.has(p))),
  );
}

/** The app's icon, served by the app itself (every app ships /icons/icon-192.png). */
export function appIconUrl(app: Pick<AppInfo, "url">): string {
  return `${app.url.replace(/\/$/, "")}/icons/icon-192.png`;
}

/** The switcher's fixed order: the core apps first, then the modules. It never changes with the plan. */
const switcherOrder: readonly AppKey[] = ["admin", "me", "time", "go", "orders", "stock", "pos", "sites"];
export const coreApps: readonly AppKey[] = ["admin", "me", "time"];

/** What the app switcher shows for one app: open it, locked by the plan, or listed as coming soon. */
export type AppStatus = "on" | "locked" | "soon";
export interface SwitcherApp { app: AppInfo; status: AppStatus }

/** Permissions that mark a person as someone who runs the company; only they see apps that are not built yet. */
export const adminAppPermissions: readonly string[] = adminPermissions;

/**
 * The apps the switcher lists, in a fixed order (core apps first, so nothing moves when a plan changes).
 * - on: built, the person's permissions allow it and the plan includes its module.
 * - locked: built and allowed for this person, but the plan does not include its module.
 * - soon: not built yet; shown only to people who run the company.
 * Apps the person's permissions do not allow are left out entirely.
 */
export function switcherApps(modules: readonly string[], permissions: readonly string[], apps: readonly AppInfo[] = APPS): SwitcherApp[] {
  const mods = new Set(modules);
  const perms = new Set(permissions);
  const runsCompany = adminPermissions.some((p) => perms.has(p));
  const out: SwitcherApp[] = [];
  for (const a of apps) {
    if (!a.built) {
      if (runsCompany) out.push({ app: a, status: "soon" });
      continue;
    }
    if (a.permissionsAny && !a.permissionsAny.some((p) => perms.has(p))) continue;
    out.push({ app: a, status: !a.module || mods.has(a.module) ? "on" : "locked" });
  }
  return out.sort((x, y) => switcherOrder.indexOf(x.app.key) - switcherOrder.indexOf(y.app.key));
}

/** What the switcher needs to know, as the database gives it. The list of apps is worked out from it in the browser. */
export interface SwitcherCompany { id: string; name: string; nameLocal: string | null; active: boolean }
export interface SwitcherData { modules: string[]; permissions: string[]; companies: SwitcherCompany[] }

type RpcName = "my_enabled_modules" | "my_permissions" | "list_my_companies";

/**
 * Reads the company's plan modules, the person's permissions and their companies. Each app passes its own
 * Supabase client wrapped as `rpc`, so this package needs no database dependency. A failed call counts as empty:
 * the switcher is only a convenience and RLS still guards the data.
 */
export async function loadSwitcherData(rpc: (fn: RpcName) => PromiseLike<{ data: unknown }>): Promise<SwitcherData> {
  const [mods, perms, cos] = await Promise.all([rpc("my_enabled_modules"), rpc("my_permissions"), rpc("list_my_companies")]);
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    modules: Array.isArray(mods.data) ? (mods.data as string[]) : [],
    permissions: list(perms.data).map((p) => String(p.permission_key)),
    companies: list(cos.data).map((c) => ({
      id: String(c.membership_id), name: String(c.name), nameLocal: (c.name_local as string | null) ?? null, active: !!c.is_active,
    })),
  };
}
