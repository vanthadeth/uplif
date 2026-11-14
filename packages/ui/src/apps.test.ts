import { describe, expect, it } from "vitest";
import { APPS, appIconUrl, switcherApps, visibleApps, type AppInfo } from "./apps";

const keys = (a: AppInfo[]) => a.map((x) => x.key);

describe("visibleApps", () => {
  it("shows Me to everyone, even with nothing else", () => {
    expect(keys(visibleApps([], []))).toEqual(["me"]);
  });
  it("shows Admin only with an admin permission", () => {
    expect(keys(visibleApps([], ["org.member.update"]))).toContain("admin");
    expect(keys(visibleApps([], ["org.member.read"]))).not.toContain("admin");
  });
  it("shows Go only when the plan has field sales and the person can see customers", () => {
    expect(keys(visibleApps(["field_sales"], ["sales.customer.read"]))).toContain("go");
    expect(keys(visibleApps([], ["sales.customer.read"]))).not.toContain("go");
    expect(keys(visibleApps(["field_sales"], []))).not.toContain("go");
  });
  it("never shows an app that is not built yet", () => {
    const all = visibleApps(["attendance", "field_sales", "inventory", "invoice", "pos", "projects_sites"], ["org.role.manage", "sales.customer.read"]);
    expect(keys(all).sort()).toEqual(["admin", "go", "me"]);
    expect(APPS.filter((a) => !a.built).every((a) => !keys(all).includes(a.key))).toBe(true);
  });
});

describe("appIconUrl", () => {
  it("points at the app's own icon without a double slash", () => {
    expect(appIconUrl({ url: "https://x.test/" })).toBe("https://x.test/icons/icon-192.png");
    expect(appIconUrl({ url: "https://x.test" })).toBe("https://x.test/icons/icon-192.png");
  });
});

describe("switcherApps", () => {
  const st = (mods: string[], perms: string[]) => Object.fromEntries(switcherApps(mods, perms).map((x) => [x.app.key, x.status]));
  it("shows only Me to a person with no permissions, and hides apps that are not built", () => {
    expect(st([], [])).toEqual({ me: "on" });
  });
  it("lists admin apps and what is coming soon for a person who runs the company", () => {
    expect(st(["field_sales"], ["org.member.update", "sales.customer.read", "stock.catalog.read"])).toEqual({
      me: "on", admin: "on", time: "soon", go: "on", orders: "soon", stock: "locked", pos: "soon", sites: "soon",
    });
  });
  it("locks a built app the person may use when the plan lacks its module", () => {
    expect(st([], ["sales.customer.read"]).go).toBe("locked");
  });
  it("hides a built app the person may not use, even when the plan has it", () => {
    expect(st(["field_sales"], [])).toEqual({ me: "on" });
  });
  it("keeps a fixed order with the core apps first", () => {
    const keys = switcherApps(["field_sales"], ["org.member.update", "sales.customer.read", "stock.catalog.read"]).map((x) => x.app.key);
    expect(keys).toEqual(["admin", "me", "time", "go", "orders", "stock", "pos", "sites"]);
  });
});

describe("stock app", () => {
  it("needs a Stock permission and the inventory module", () => {
    const keys = (a: { key: string }[]) => a.map((x) => x.key);
    expect(keys(visibleApps(["inventory"], ["stock.catalog.read"]))).toContain("stock");
    expect(keys(visibleApps(["inventory"], ["org.role.manage"]))).not.toContain("stock");
    expect(keys(visibleApps([], ["stock.catalog.manage"]))).not.toContain("stock");
  });
});
