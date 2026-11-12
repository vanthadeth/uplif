/** A holiday row as the Holidays page holds it. */
export interface Holiday {
  id: string; name: string; name_local: string | null; holiday_date: string; repeats_yearly: boolean;
  observed_date: string | null; branch_id: string | null; provisional: boolean; source: "manual" | "preset";
}

/** One holiday on one actual day off. `date` is the day taken off; `original` is set when it was moved there. */
export interface Occurrence { holiday: Holiday; date: string; original: string | null }

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The days off a company's holidays give in one year. A yearly holiday repeats on the same month and day from the year
 * it starts (a 29 February holiday only in leap years); a one-off holiday counts in the year of the day it is taken
 * (its observed day when it has one). Mirrors app.work_day in the database.
 */
export function occurrencesIn(holidays: Holiday[], year: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const h of holidays) {
    const [y, m, d] = h.holiday_date.split("-").map(Number);
    if (h.repeats_yearly) {
      if (y > year || (m === 2 && d === 29 && !isLeap(year))) continue;
      out.push({ holiday: h, date: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, original: null });
    } else {
      const day = h.observed_date ?? h.holiday_date;
      if (Number(day.slice(0, 4)) === year) out.push({ holiday: h, date: day, original: h.observed_date ? h.holiday_date : null });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.holiday.name.localeCompare(b.holiday.name));
}

/** A one-off holiday that has passed is history and cannot be changed; a yearly one never is. */
export const isHistory = (h: Holiday, today: string) => !h.repeats_yearly && (h.observed_date ?? h.holiday_date) < today;

/** 0 = Monday ... 6 = Sunday for the first day of a month, and its number of days. */
export function monthShape(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return { offset: (first.getUTCDay() + 6) % 7, days: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}
