/** Item property groups (choices that are not counted in stock). Plain code so server pages can use it too. */
export type PropOption = { name: string; name_local: string | null; extra_charge: number };
export type PropGroup = { name: string; name_local: string | null; selection: "one" | "many"; required: boolean; options: PropOption[] };
export const MAX_GROUPS = 20;
export const MAX_OPTIONS = 30;

/** Read the stored jsonb back into typed groups, ignoring anything malformed. */
export function parseProperties(raw: unknown): PropGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    if (!g || typeof g !== "object" || !Array.isArray((g as PropGroup).options)) return [];
    const x = g as PropGroup;
    return [{
      name: String(x.name ?? ""), name_local: x.name_local ? String(x.name_local) : null,
      selection: x.selection === "many" ? "many" as const : "one" as const, required: x.required === true,
      options: x.options.map((o) => ({ name: String(o.name ?? ""), name_local: o.name_local ? String(o.name_local) : null, extra_charge: Number(o.extra_charge) || 0 })),
    }];
  });
}
