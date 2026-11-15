/** Turns rows into CSV text and saves it as a file. Shared by every app that offers an export. */
export type CsvCell = string | number | null | undefined;

/** Text that starts with = + - @ could run as a formula when opened in a spreadsheet, so it gets a leading apostrophe. Numbers are left alone. */
function cell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v) : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Saves CSV text as a file. The byte order mark makes Excel read Khmer and other scripts correctly. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
