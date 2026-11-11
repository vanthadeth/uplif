"use client";
import { useI18n } from "./i18n";
import { languages } from "./languages";
import { dictionaries } from "./messages";

/**
 * Options for the language popup: the featured languages, plus the one in use if it is not featured, so the
 * current choice is always visible. `all` is every supported language, for the language page.
 * Languages without approved strings are marked "English for now".
 */
export function useLanguageOptions() {
  const { t, locale } = useI18n();
  const all = languages.map((l) => ({
    code: l.code, native: l.native, english: l.english, featured: l.featured,
    note: l.code === "en" || dictionaries[l.code] ? undefined : t("lang.fallback"),
  }));
  const options = all.filter((o) => o.featured || o.code === locale);
  return { options, all };
}
