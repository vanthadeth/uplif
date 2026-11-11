import { describe, expect, it } from "vitest";
import { describeAction } from "./activity";
import { en } from "./messages";
import { seatsUsed, trialDaysLeft } from "./plan";

describe("dashboard rules", () => {
  it("counts pending invitations as seats and leaves suspended users out", () => {
    expect(seatsUsed(6, 2)).toBe(8);
  });
  it("counts trial days from company creation and never goes below zero", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(trialDaysLeft("2026-11-11T12:00:00Z", now)).toBe(5);
    expect(trialDaysLeft("2026-11-20T11:00:00Z", now)).toBe(14);
    expect(trialDaysLeft("2026-10-01T00:00:00Z", now)).toBe(0);
  });
  it("describes audit actions with a known sentence", () => {
    expect(describeAction("branches.insert", { row: { name: "Siem Reap" } })).toEqual({ key: "db.act.branches.insert", name: "Siem Reap" });
    expect(describeAction("branches.insert", {}).key).toBe("db.act.branches.insertAny");
    expect(describeAction("memberships.update", { old: { status: "active" }, new: { status: "suspended" } }).key).toBe("db.act.memberships.suspended");
    expect(describeAction("role_permissions.delete", {}).key).toBe("db.act.role_permissions");
    expect(describeAction("something.new", {}).key).toBe("db.act.other");
  });
  it("has an English sentence for every key it can return", () => {
    for (const a of ["invitation.create", "invitation.accept", "invitation.revoke", "company.create", "companies.update", "company_settings.update", "branches.update", "branches.delete", "roles.insert", "roles.update", "roles.delete", "membership_roles.insert", "membership_roles.delete", "x.y"]) {
      expect(en[describeAction(a, {}).key]).toBeTruthy();
    }
  });
});
