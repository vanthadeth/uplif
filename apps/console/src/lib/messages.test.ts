import { describe, expect, it } from "vitest";
import { en, km } from "./messages";

const enKeys = Object.keys(en);

describe("messages", () => {
  it("has no Khmer key without an English source", () => {
    const orphans = Object.keys(km).filter((k) => !(k in en));
    expect(orphans).toEqual([]);
  });
  it("has a Khmer string for every English string", () => {
    const missing = enKeys.filter((k) => !(k in km));
    expect(missing).toEqual([]);
  });
  it("has no empty strings", () => {
    expect(enKeys.filter((k) => !en[k as keyof typeof en].trim())).toEqual([]);
    expect(Object.entries(km).filter(([, v]) => !v?.trim())).toEqual([]);
  });
  it("keeps numbers and symbols that must not change between languages", () => {
    // Example digits like 012 345 678 and the 6-digit/7-day figures must survive translation.
    expect(km["auth.error.phone"]).toContain("012 345 678");
    expect(km["invite.linkBody"]).toMatch(/[7៧]/);
  });
});
