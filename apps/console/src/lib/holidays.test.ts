import { describe, expect, it } from "vitest";
import { isHistory, monthShape, occurrencesIn, type Holiday } from "./holidays";

const h = (p: Partial<Holiday>): Holiday => ({ id: "x", name: "H", name_local: null, holiday_date: "2027-01-01", repeats_yearly: false, observed_date: null, branch_id: null, provisional: false, source: "manual", ...p });

describe("occurrencesIn", () => {
  it("repeats a yearly holiday from its first year on", () => {
    const list = [h({ repeats_yearly: true, holiday_date: "2026-01-01" })];
    expect(occurrencesIn(list, 2025)).toEqual([]);
    expect(occurrencesIn(list, 2028).map((o) => o.date)).toEqual(["2028-01-01"]);
  });
  it("skips 29 February outside leap years", () => {
    const list = [h({ repeats_yearly: true, holiday_date: "2024-02-29" })];
    expect(occurrencesIn(list, 2027)).toEqual([]);
    expect(occurrencesIn(list, 2028)).toHaveLength(1);
  });
  it("counts a one-off holiday on its observed day", () => {
    const list = [h({ holiday_date: "2027-05-01", observed_date: "2027-05-03" })];
    const [o] = occurrencesIn(list, 2027);
    expect(o.date).toBe("2027-05-03");
    expect(o.original).toBe("2027-05-01");
  });
  it("puts a holiday observed in the next year in that year", () => {
    const list = [h({ holiday_date: "2027-12-31", observed_date: "2028-01-03" })];
    expect(occurrencesIn(list, 2027)).toEqual([]);
    expect(occurrencesIn(list, 2028)).toHaveLength(1);
  });
  it("sorts by day", () => {
    const list = [h({ id: "b", holiday_date: "2027-06-01" }), h({ id: "a", holiday_date: "2027-02-01" })];
    expect(occurrencesIn(list, 2027).map((o) => o.holiday.id)).toEqual(["a", "b"]);
  });
});

describe("isHistory", () => {
  it("is true only for a passed one-off holiday", () => {
    expect(isHistory(h({ holiday_date: "2026-01-01" }), "2026-06-01")).toBe(true);
    expect(isHistory(h({ holiday_date: "2026-01-01", repeats_yearly: true }), "2026-06-01")).toBe(false);
    expect(isHistory(h({ holiday_date: "2026-01-01", observed_date: "2026-07-01" }), "2026-06-01")).toBe(false);
  });
});

describe("monthShape", () => {
  it("gives the Monday-based offset and length", () => {
    expect(monthShape(2027, 2)).toEqual({ offset: 0, days: 28 }); // 1 Feb 2027 is a Monday
    expect(monthShape(2028, 2).days).toBe(29);
  });
});
