/** Small CSV reader and the item import rules. Pure functions, no network, so they are easy to test. */

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_COLUMNS = ["name", "name_local", "sku", "barcode", "unit", "price", "reorder_level", "category", "brand"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Header names people are likely to type, mapped to our columns. */
const ALIASES: Record<string, ImportColumn> = {
  name: "name", "item name": "name", item: "name",
  name_local: "name_local", "name in local language": "name_local", "local name": "name_local", namelocal: "name_local",
  sku: "sku", code: "sku",
  barcode: "barcode", "bar code": "barcode", ean: "barcode", upc: "barcode",
  unit: "unit", uom: "unit", base_uom: "unit",
  price: "price", "sell price": "price", "selling price": "price",
  reorder_level: "reorder_level", reorder: "reorder_level", "reorder level": "reorder_level",
  category: "category", brand: "brand",
};

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, a BOM, and comma, semicolon or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Column positions from the header row. Unknown headers are ignored. */
export function mapHeader(header: string[]): Partial<Record<ImportColumn, number>> {
  const map: Partial<Record<ImportColumn, number>> = {};
  header.forEach((h, i) => {
    const col = ALIASES[h.trim().toLowerCase()];
    if (col && map[col] === undefined) map[col] = i;
  });
  return map;
}

export type RowError = "nameRequired" | "priceInvalid" | "reorderInvalid" | "skuDup" | "barcodeDup" | "categoryUnknown" | "brandUnknown" | "uomTooLong";
export interface ImportRow {
  line: number; // line number in the file, header = 1
  name: string; name_local: string | null; sku: string | null; barcode: string | null; base_uom: string;
  price: number; reorder_level: number | null; category_id: string | null; brand_id: string | null;
  errors: RowError[];
}
export interface Lookups {
  categories: { id: string; name: string; name_local: string | null }[];
  brands: { id: string; name: string; name_local: string | null }[];
  existingSkus: Iterable<string>;
  existingBarcodes: Iterable<string>;
}

const norm = (s: string) => s.trim().toLowerCase();
const byName = (list: { id: string; name: string; name_local: string | null }[]) => {
  const m = new Map<string, string>();
  for (const x of list) { if (!m.has(norm(x.name))) m.set(norm(x.name), x.id); if (x.name_local && !m.has(norm(x.name_local))) m.set(norm(x.name_local), x.id); }
  return m;
};

/** Turns parsed CSV rows (header first) into checked import rows. A row with errors is never imported. */
export function buildRows(table: string[][], look: Lookups): { rows: ImportRow[]; missingName: boolean; tooMany: boolean } {
  if (table.length === 0) return { rows: [], missingName: true, tooMany: false };
  const cols = mapHeader(table[0]);
  if (cols.name === undefined) return { rows: [], missingName: true, tooMany: false };
  const get = (r: string[], c: ImportColumn) => (cols[c] === undefined ? "" : (r[cols[c]!] ?? "").trim());
  const cats = byName(look.categories), brands = byName(look.brands);
  const skus = new Set([...look.existingSkus].map(norm)), codes = new Set([...look.existingBarcodes].map(norm));
  const body = table.slice(1);
  const rows: ImportRow[] = body.slice(0, IMPORT_MAX_ROWS).map((r, n) => {
    const errors: RowError[] = [];
    const name = get(r, "name");
    if (!name) errors.push("nameRequired");
    const priceText = get(r, "price"), price = priceText === "" ? 0 : Number(priceText.replace(/,/g, ""));
    if (!Number.isFinite(price) || price < 0) errors.push("priceInvalid");
    const reorderText = get(r, "reorder_level"), reorder = reorderText === "" ? null : Number(reorderText.replace(/,/g, ""));
    if (reorder !== null && (!Number.isFinite(reorder) || reorder < 0)) errors.push("reorderInvalid");
    const sku = get(r, "sku") || null, barcode = get(r, "barcode") || null;
    if (sku && skus.has(norm(sku))) errors.push("skuDup"); else if (sku) skus.add(norm(sku));
    if (barcode && codes.has(norm(barcode))) errors.push("barcodeDup"); else if (barcode) codes.add(norm(barcode));
    const catText = get(r, "category"), brandText = get(r, "brand");
    const category_id = catText ? cats.get(norm(catText)) ?? null : null;
    const brand_id = brandText ? brands.get(norm(brandText)) ?? null : null;
    if (catText && !category_id) errors.push("categoryUnknown");
    if (brandText && !brand_id) errors.push("brandUnknown");
    const unit = get(r, "unit") || "pcs";
    if (unit.length > 30) errors.push("uomTooLong");
    return {
      line: n + 2, name, name_local: get(r, "name_local") || null, sku, barcode, base_uom: unit,
      price: Number.isFinite(price) ? price : 0, reorder_level: reorder !== null && Number.isFinite(reorder) ? reorder : null,
      category_id, brand_id, errors,
    };
  });
  return { rows, missingName: false, tooMany: body.length > IMPORT_MAX_ROWS };
}

/** The file people can download, fill in and upload. */
export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(",")}\nCoca-Cola 330ml can,កូកាកូឡា កំប៉ុង 330ml,COKE-330,8851959132012,can,0.5,24,Drinks,Coca-Cola\n`;
