import type { Database } from "@uplif/supabase/types";

export type DayKind = Database["public"]["Enums"]["schedule_day_kind"];
export type AssignScope = Database["public"]["Enums"]["assignment_scope"];
export type Pattern = "mon_fri" | "mon_fri_sat_half" | "mon_sat";

/** One weekday of a schedule as the editor holds it. weekday: 1 = Monday ... 7 = Sunday (ISO). Times are "HH:MM". */
export interface DayDraft { weekday: number; kind: DayKind; start: string; end: string; break_min: number }

export interface RulesDraft {
  grace_late_min: number; grace_early_min: number; earliest_clock_in_min: number;
  half_day_late_min: number; overtime_after_min: number; overtime_needs_approval: boolean;
}

export const DEFAULT_RULES: RulesDraft = {
  grace_late_min: 10, grace_early_min: 0, earliest_clock_in_min: 60, half_day_late_min: 120, overtime_after_min: 30, overtime_needs_approval: true,
};

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The three starting patterns offered by setup. Mirrors app.pattern_days in the database. */
export function patternDays(p: Pattern): DayDraft[] {
  return WEEKDAYS.map((w) => {
    if (w <= 5 || (p === "mon_sat" && w === 6)) return { weekday: w, kind: "full", start: "08:00", end: "17:00", break_min: 60 };
    if (w === 6 && p === "mon_fri_sat_half") return { weekday: w, kind: "half", start: "08:00", end: "12:00", break_min: 0 };
    return { weekday: w, kind: "off", start: "08:00", end: "17:00", break_min: 0 };
  });
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Hours worked on one day. An end at or before the start means the shift crosses midnight. */
export function dayHours(d: Pick<DayDraft, "kind" | "start" | "end" | "break_min">): number {
  if (d.kind === "off" || !d.start || !d.end) return 0;
  let mins = toMin(d.end) - toMin(d.start);
  if (mins <= 0) mins += 1440;
  return Math.max(mins - (d.break_min || 0), 0) / 60;
}

export const weekHours = (days: DayDraft[]) => days.reduce((sum, d) => sum + dayHours(d), 0);

/** Times from the database come as HH:MM:SS; the editor and the display use HH:MM. */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** The date a schedule or assignment can first start on is today in the company's timezone. */
export function todayIn(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The first schedule version ever written covers all time; the pages never show its date. */
export const EPOCH = "2000-01-01";

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Timezones offered in the company timezone picker (the saved one is always added). */
export const TIMEZONES = [
  "Asia/Phnom_Penh", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Vientiane", "Asia/Yangon", "Asia/Kuala_Lumpur", "Asia/Singapore",
  "Asia/Jakarta", "Asia/Manila", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Seoul", "Asia/Tokyo", "Asia/Kolkata", "Asia/Dubai",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC",
];

/** Short weekday name for ISO weekday 1..7 in a date locale tag (1 January 2024 was a Monday). */
export const weekdayShort = (dateTag: string, weekday: number) =>
  new Intl.DateTimeFormat(dateTag, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, weekday)));
