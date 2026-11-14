import { describe, expect, it } from "vitest";
import { appOfPermission, applyPreset, changeCount, draftFrom, groupLevel, groupOf, emptyDraft, SCOPED_KEYS } from "./role-access";

describe("appOfPermission", () => {
  it("maps keys to the app whose screens use them", () => {
    expect(appOfPermission("org.member.update")).toBe("admin");
    expect(appOfPermission("leave.request.review")).toBe("admin");
    expect(appOfPermission("attendance.clock.self")).toBe("time");
    expect(appOfPermission("sales.customer.read")).toBe("go");
    expect(appOfPermission("stock.item.read")).toBe("stock");
  });
  it("leaves branch read in no app, because every app needs it", () => {
    expect(appOfPermission("org.branch.read")).toBeNull();
  });
});

describe("groupOf", () => {
  it("places leave and learning keys in the growth group", () => {
    expect(groupOf("leave.request.review")?.id).toBe("growth");
    expect(groupOf("attendance.holiday.manage")?.id).toBe("schedules");
    expect(groupOf("org.audit.read")?.id).toBe("roles");
  });
});

describe("draftFrom", () => {
  it("reads a missing app row as allowed only where the role holds actions", () => {
    const d = draftFrom([], [{ permission_key: "attendance.clock.self", data_scope: "company" }], false);
    expect(d.apps.time).toBe(true);
    expect(d.apps.admin).toBe(false);
  });
  it("lets an explicit denial win over held actions", () => {
    const d = draftFrom([{ app_key: "time", allowed: false }], [{ permission_key: "attendance.clock.self", data_scope: "company" }], false);
    expect(d.apps.time).toBe(false);
  });
  it("shows the Owner role with every app on", () => {
    expect(Object.values(draftFrom([], [], true).apps).every(Boolean)).toBe(true);
  });
});

describe("groupLevel and applyPreset", () => {
  const keys = ["org.branch.read", "org.branch.create", "org.branch.update"];
  it("is none, view, full or custom", () => {
    expect(groupLevel(keys, {}).level).toBe("none");
    expect(groupLevel(keys, { "org.branch.read": "branch" })).toMatchObject({ level: "view", scope: "branch" });
    expect(groupLevel(keys, { "org.branch.read": "company", "org.branch.create": "company", "org.branch.update": "company" }).level).toBe("full");
    expect(groupLevel(keys, { "org.branch.create": "company" }).level).toBe("custom");
  });
  it("applies the three quick sets", () => {
    const start = { "org.branch.read": "own" as const, "org.branch.create": "company" as const };
    expect(applyPreset(keys, start, "none")).toEqual({});
    expect(applyPreset(keys, start, "view")).toEqual({ "org.branch.read": "own" });
    expect(Object.keys(applyPreset(keys, {}, "full"))).toHaveLength(3);
  });
  it("offers scopes only on read actions", () => {
    expect(SCOPED_KEYS.has("org.member.read")).toBe(true);
    expect(SCOPED_KEYS.has("org.member.update")).toBe(false);
  });
});

describe("changeCount", () => {
  it("counts changed apps and actions", () => {
    const a = emptyDraft();
    const b = { apps: { ...a.apps, go: true }, perms: { "sales.customer.read": "own" as const } };
    expect(changeCount(a, a)).toBe(0);
    expect(changeCount(a, b)).toBe(2);
  });
});
