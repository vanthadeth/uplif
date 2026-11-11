export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Used / limit as a bar. The words are always shown too, so colour is never the only signal. */
export function UsageBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = limit != null && used >= limit;
  return (
    <div role="img" aria-label={label} className="h-2 overflow-hidden rounded-full bg-neutral-soft">
      <div className={`h-full rounded-full ${full ? "bg-warning-ink" : "bg-primary"}`} style={{ width: `${limit ? pct : 0}%` }} />
    </div>
  );
}

/** "2026-11-08" (a date with no time) as "8 Nov 2026", without time-zone shifts. */
export const fmtDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
