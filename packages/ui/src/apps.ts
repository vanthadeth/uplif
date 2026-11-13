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
  { key: "time", name: "UPLIF Time", blurb: "Clock in and attendance", blurbKey: "app.time.blurb", built: false, module: "attendance",
    url: process.env.NEXT_PUBLIC_URL_TIME ?? "" },
  { key: "go", name: "UPLIF Go", blurb: "Customer visits and notes", blurbKey: "app.go.blurb", built: true, module: "field_sales",
    permissionsAny: ["sales.customer.read"],
    url: process.env.NEXT_PUBLIC_URL_GO ?? "https://uplif-go.vercel.app" },
  { key: "orders", name: "UPLIF Orders", blurb: "Orders, invoices and payments", blurbKey: "app.orders.blurb", built: false, module: "invoice",
    url: process.env.NEXT_PUBLIC_URL_ORDERS ?? "" },
  { key: "stock", name: "UPLIF Stock", blurb: "Items and stock levels", blurbKey: "app.stock.blurb", built: false, module: "inventory",
    url: process.env.NEXT_PUBLIC_URL_STOCK ?? "" },
  { key: "pos", name: "UPLIF POS", blurb: "Sell at the counter", blurbKey: "app.pos.blurb", built: false, module: "pos",
    url: process.env.NEXT_PUBLIC_URL_POS ?? "" },
  { key: "sites", name: "UPLIF Sites", blurb: "Jobs, sites and teams", blurbKey: "app.sites.blurb", built: false, module: "projects_sites",
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
