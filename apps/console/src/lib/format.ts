import type { Locale } from "./i18n";
import { languageOf } from "./languages";

const tags = (l: Locale) => languageOf(l).dateTag;

export const fmtDate = (locale: Locale, iso: string) =>
  new Date(iso).toLocaleDateString(tags(locale), { year: "numeric", month: "short", day: "numeric" });

export const fmtDateTime = (locale: Locale, iso: string) =>
  new Date(iso).toLocaleString(tags(locale), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Local-language text when the UI is Khmer and a local value exists, otherwise the English name. */
export const pick = (locale: Locale, name: string, local: string | null | undefined) =>
  locale === "km" && local ? local : name;
