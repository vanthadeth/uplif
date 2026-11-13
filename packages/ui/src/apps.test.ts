import { describe, expect, it } from "vitest";
import { APPS, appIconUrl, visibleApps, type AppInfo } from "./apps";

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
