import { describe, expect, it } from "vitest";
import { distanceM, hasOpenIn, parseYmd, startOfWeek, workedMinutes, ymd } from "./format";

const ev = (kind: "in" | "out", at: string) => ({ kind, occurred_at: at, flags: [] });

describe("workedMinutes", () => {
  it("pairs each in with the next out", () => {
    const e = [ev("in", "2026-11-12T01:00:00Z"), ev("out", "2026-11-12T05:00:00Z"), ev("in", "2026-11-12T06:00:00Z"), ev("out", "2026-11-12T08:30:00Z")];
    expect(workedMinutes(e, new Date("2026-11-12T12:00:00Z"), true)).toBe(390);
  });
  it("counts an open in up to now only for today", () => {
    const e = [ev("in", "2026-11-12T01:00:00Z")];
    expect(workedMinutes(e, new Date("2026-11-12T03:30:00Z"), true)).toBe(150);
    expect(workedMinutes(e, new Date("2026-11-12T03:30:00Z"), false)).toBe(0);
  });
  it("ignores an out with no in", () => {
    expect(workedMinutes([ev("out", "2026-11-12T05:00:00Z")], new Date("2026-11-12T06:00:00Z"), true)).toBe(0);
  });
});

describe("hasOpenIn", () => {
  it("is true when the last event is an in", () => {
    expect(hasOpenIn([ev("in", "2026-11-12T01:00:00Z")])).toBe(true);
    expect(hasOpenIn([ev("in", "2026-11-12T01:00:00Z"), ev("out", "2026-11-12T05:00:00Z")])).toBe(false);
    expect(hasOpenIn([])).toBe(false);
  });
});

describe("dates", () => {
  it("starts the week on Monday", () => {
    expect(ymd(startOfWeek(parseYmd("2026-11-12")))).toBe("2026-11-09"); // Thursday
    expect(ymd(startOfWeek(parseYmd("2026-11-15")))).toBe("2026-11-09"); // Sunday
    expect(ymd(startOfWeek(parseYmd("2026-11-09")))).toBe("2026-11-09"); // Monday
  });
});

describe("distanceM", () => {
  it("is zero for the same point and about 111 km per degree of latitude", () => {
    expect(distanceM(13.36, 103.86, 13.36, 103.86)).toBe(0);
    expect(Math.abs(distanceM(0, 0, 1, 0) - 111195)).toBeLessThan(200);
  });
});
