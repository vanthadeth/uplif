"use client";
import { useI18n } from "./i18n";
import { fill } from "./messages";
import { languageOf } from "./languages";

/** Times as 24-hour clock text (the same way schedules are shown) and durations as "8 h 6 min". */
export function useFormat() {
  const { t, locale } = useI18n();
  const tag = languageOf(locale).dateTag;
  const time = (d: Date | string) => new Date(d).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const duration = (min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return fill(t("st.minutes"), { m });
    return m === 0 ? fill(t("st.hoursOnly"), { h }) : fill(t("st.hours"), { h, m });
  };
  return { time, duration, tag };
}
