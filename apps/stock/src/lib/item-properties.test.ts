import { describe, expect, it } from "vitest";
import { parseProperties } from "./item-properties";

describe("parseProperties", () => {
  it("reads stored groups and ignores anything malformed", () => {
    expect(parseProperties([{ name: "Sugar", selection: "many", required: true, options: [{ name: "Half", extra_charge: "0.5" }] }, null, { name: "bad" }])).toEqual([
      { name: "Sugar", name_local: null, selection: "many", required: true, options: [{ name: "Half", name_local: null, extra_charge: 0.5 }] },
    ]);
    expect(parseProperties(null)).toEqual([]);
  });
});
