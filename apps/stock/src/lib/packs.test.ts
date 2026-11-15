import { describe, expect, it } from "vitest";
import { blankPackRow, measureSummary, packsToRows, rowsToPacks } from "./packs";

describe("packs", () => {
  it("round-trips packs with measurements", () => {
    const packs = [{ name: "Box", qty: 12 }, { name: "Carton", qty: 72, length_cm: 60, width_cm: 40, height_cm: 35, gross_kg: 15.5, net_kg: 14 }];
    expect(rowsToPacks(packsToRows(packs))).toEqual({ packs });
  });
  it("drops empty rows", () => {
    expect(rowsToPacks([blankPackRow(), { ...blankPackRow(), name: "Box", qty: "12" }]).packs).toEqual([{ name: "Box", qty: 12 }]);
  });
  it("refuses a bad name or quantity", () => {
    expect(rowsToPacks([{ ...blankPackRow(), name: "Box", qty: "1" }]).problem).toBe("pack");
    expect(rowsToPacks([{ ...blankPackRow(), qty: "12" }]).problem).toBe("pack");
    expect(rowsToPacks([{ ...blankPackRow(), name: "Box", qty: "2.5" }]).problem).toBe("pack");
  });
  it("refuses bad measurements and net above gross", () => {
    expect(rowsToPacks([{ ...blankPackRow(), name: "Box", qty: "12", length_cm: "-1" }]).problem).toBe("measure");
    expect(rowsToPacks([{ ...blankPackRow(), name: "Box", qty: "12", gross_kg: "x" }]).problem).toBe("measure");
    expect(rowsToPacks([{ ...blankPackRow(), name: "Box", qty: "12", gross_kg: "1", net_kg: "2" }]).problem).toBe("weight");
  });
  it("summarises", () => {
    expect(measureSummary({ name: "C", qty: 72, length_cm: 60, width_cm: 40, height_cm: 35, gross_kg: 15, net_kg: 14 })).toBe("60 × 40 × 35 cm · GW 15 kg · NW 14 kg");
    expect(measureSummary({ name: "C", qty: 72 })).toBe("");
  });
});
