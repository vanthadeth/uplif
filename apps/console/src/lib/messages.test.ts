import { describe, expect, it } from "vitest";
import { dictionaries, en, km } from "./messages";
import { languages } from "./languages";

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
  it("lists each language once, English first, with a dictionary only for listed languages", () => {
    const codes = languages.map((l) => l.code as string);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe("en");
    expect(Object.keys(dictionaries).filter((c) => !codes.includes(c))).toEqual([]);
  });
  it("gives every listed language a native name, an English name and a date tag", () => {
    for (const l of languages) expect([l.native, l.english, l.dateTag].every((v) => v.trim().length > 0)).toBe(true);
  });
});
