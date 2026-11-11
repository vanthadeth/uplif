export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Parses "5", "5.50" or "5,50" into cents, or null when it is not a non-negative amount. */
export function toCents(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const fromCents = (cents: number | null) => (cents == null ? "" : String(cents / 100));

export const MODULES = [
  { id: "attendance", label: "Attendance" },
  { id: "field_sales", label: "Field sales" },
  { id: "inventory", label: "Inventory" },
] as const;
export const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;

export const STATUS = {
  trial: { label: "Trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Past due", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
} as const;
export type Status = keyof typeof STATUS;
