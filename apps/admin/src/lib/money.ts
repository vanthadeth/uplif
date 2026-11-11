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

export const INVOICE_STATUS = {
  open: { label: "Due", tone: "info" },
  overdue: { label: "Overdue", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "neutral" },
} as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUS;

export const PAY_METHODS = [
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "khqr", label: "KHQR" },
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
] as const;
export const methodLabel = (id: string | null) => PAY_METHODS.find((m) => m.id === id)?.label ?? "—";

export const GRANT_STATUS = {
  requested: { label: "Waiting for the owner", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Withdrawn", tone: "neutral" },
  ended: { label: "Ended", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
} as const;
export type GrantStatus = keyof typeof GRANT_STATUS;
