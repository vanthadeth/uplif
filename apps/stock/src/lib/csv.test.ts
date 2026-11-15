import { describe, expect, it } from "vitest";
import { buildRows, parseCsv } from "./csv";

const look = {
  categories: [{ id: "c1", name: "Drinks", name_local: null }],
  brands: [{ id: "b1", name: "Coca-Cola", name_local: "កូកាកូឡា" }],
  existingSkus: ["OLD-1"], existingBarcodes: ["999"],
};

describe("parseCsv", () => {
  it("reads quotes, doubled quotes and a BOM", () => {
    expect(parseCsv('﻿name,note\n"A, B","say ""hi"""\n')).toEqual([["name", "note"], ["A, B", 'say "hi"']]);
  });
  it("detects semicolons and skips blank lines", () => {
    expect(parseCsv("name;price\r\nTea;2\r\n\r\n")).toEqual([["name", "price"], ["Tea", "2"]]);
  });
});

describe("buildRows", () => {
  it("needs a name column", () => {
    expect(buildRows([["sku"], ["x"]], look).missingName).toBe(true);
  });
  it("maps header aliases and defaults", () => {
    const { rows } = buildRows([["Item name", "SKU", "Barcode", "Price", "Category", "Brand"], ["Cola", "C1", "111", "1,5", "drinks", "កូកាកូឡា"]], look);
    expect(rows[0]).toMatchObject({ name: "Cola", sku: "C1", barcode: "111", price: 15, base_uom: "pcs", category_id: "c1", brand_id: "b1", errors: [] });
  });
  it("flags bad rows without dropping them", () => {
    const { rows } = buildRows([["name", "sku", "barcode", "price", "category", "reorder_level"],
      ["", "", "", "", "", ""], ["A", "old-1", "999", "-1", "Nope", "x"], ["B", "N1", "", "", "", ""], ["C", "n1", "", "", "", ""]], look);
    expect(rows[0].errors).toEqual(["nameRequired"]);
    expect(rows[1].errors).toEqual(["priceInvalid", "reorderInvalid", "skuDup", "barcodeDup", "categoryUnknown"]);
    expect(rows[2].errors).toEqual([]);
    expect(rows[3].errors).toEqual(["skuDup"]); // repeated inside the file
  });
  it("caps the rows", () => {
    const t = [["name"], ...Array.from({ length: 501 }, (_, i) => [`n${i}`])];
    const r = buildRows(t, look);
    expect(r.rows).toHaveLength(500);
    expect(r.tooMany).toBe(true);
  });
});
