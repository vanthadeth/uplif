import { describe, expect, it } from "vitest";
import { toE164 } from "./phone";
import { nextStep } from "./next-step";

describe("toE164", () => {
  it("converts Cambodian local numbers", () => {
    expect(toE164("012 345 678")).toBe("+85512345678");
    expect(toE164("+855 12 345 678")).toBe("+85512345678");
    expect(toE164("0085512345678")).toBe("+85512345678");
  });
  it("rejects empty or too-short input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("12")).toBeNull();
    expect(toE164("abc")).toBeNull();
  });
});

describe("nextStep", () => {
  const base = { signedIn: true, hasProfile: true, hasCompanyClaim: false, companyCount: 0 };
  it("walks the first-time flow", () => {
    expect(nextStep({ ...base, signedIn: false })).toBe("/login");
    expect(nextStep({ ...base, hasProfile: false })).toBe("/profile");
    expect(nextStep(base)).toBe("/companies/new");
    expect(nextStep({ ...base, companyCount: 2 })).toBe("/companies");
    expect(nextStep({ ...base, companyCount: 2, hasCompanyClaim: true })).toBe("/dashboard");
  });
});
