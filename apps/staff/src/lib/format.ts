/** Date and time helpers for the staff app. Days are the phone's local calendar days. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Monday of the week that holds `d`. */
export function startOfWeek(d: Date) {
  const back = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -back);
}

/** Parse "2026-11-12" as a local date (new Date("2026-11-12") would be UTC). */
export function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "08:00:00" -> "08:00" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Distance in metres between two points (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(a)));
}

export interface EventLite { kind: "in" | "out"; occurred_at: string; flags: string[] }

/**
 * Minutes worked from a day's events (oldest first): each "in" pairs with the next "out".
 * An "in" with no "out" counts up to `now` only when `openUntilNow` is true (today).
 */
export function workedMinutes(events: EventLite[], now: Date, openUntilNow: boolean) {
  let total = 0;
  let open: number | null = null;
  for (const e of events) {
    const at = new Date(e.occurred_at).getTime();
    if (e.kind === "in") { if (open === null) open = at; }
    else if (open !== null) { total += Math.max(0, at - open); open = null; }
  }
  if (open !== null && openUntilNow) total += Math.max(0, now.getTime() - open);
  return Math.round(total / 60000);
}

export const hasOpenIn = (events: EventLite[]) => events.length > 0 && events[events.length - 1].kind === "in";
