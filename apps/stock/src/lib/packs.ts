/** Packs: shortcut sizes for receiving and moving stock (Box of 12, Carton of 72), with an optional carton size and weight. */
export type Pack = {
  name: string; qty: number;
  length_cm?: number; width_cm?: number; height_cm?: number; gross_kg?: number; net_kg?: number;
};
export const MEASURES = ["length_cm", "width_cm", "height_cm", "gross_kg", "net_kg"] as const;
export type Measure = (typeof MEASURES)[number];
export const MAX_PACKS = 10;

/** One pack while it is being edited: everything is text. */
export interface PackRow { name: string; qty: string; length_cm: string; width_cm: string; height_cm: string; gross_kg: string; net_kg: string }
export const blankPackRow = (): PackRow => ({ name: "", qty: "", length_cm: "", width_cm: "", height_cm: "", gross_kg: "", net_kg: "" });

export function packsToRows(packs: Pack[] | null | undefined): PackRow[] {
  return (packs ?? []).map((p) => ({ ...blankPackRow(), name: p.name, qty: String(p.qty), ...Object.fromEntries(MEASURES.filter((m) => p[m] != null).map((m) => [m, String(p[m])])) }));
}

export type PackProblem = "pack" | "measure" | "weight";

/** Clean the rows and check them the same way the database does. Empty rows are dropped. */
export function rowsToPacks(rows: PackRow[]): { packs: Pack[]; problem?: PackProblem } {
  const packs: Pack[] = [];
  for (const r of rows) {
    if (!Object.values(r).some((v) => v.trim())) continue;
    const qty = Number(r.qty);
    if (!r.name.trim() || r.qty.trim() === "" || !Number.isInteger(qty) || qty < 2) return { packs, problem: "pack" };
    const p: Pack = { name: r.name.trim(), qty };
    for (const m of MEASURES) {
      if (r[m].trim() === "") continue;
      const n = Number(r[m]);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { packs, problem: "measure" };
      p[m] = n;
    }
    if (p.gross_kg !== undefined && p.net_kg !== undefined && p.net_kg > p.gross_kg) return { packs, problem: "weight" };
    packs.push(p);
  }
  return { packs };
}

/** "60 × 40 × 35 cm · GW 15 kg · NW 14 kg", or "" when nothing is set. */
export function measureSummary(p: Pack): string {
  const parts: string[] = [];
  if (p.length_cm !== undefined || p.width_cm !== undefined || p.height_cm !== undefined) {
    parts.push(`${[p.length_cm, p.width_cm, p.height_cm].map((n) => (n === undefined ? "–" : String(n))).join(" × ")} cm`);
  }
  if (p.gross_kg !== undefined) parts.push(`GW ${p.gross_kg} kg`);
  if (p.net_kg !== undefined) parts.push(`NW ${p.net_kg} kg`);
  return parts.join(" · ");
}
