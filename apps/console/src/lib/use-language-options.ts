"use client";
import { useI18n } from "./i18n";
import { languages } from "./languages";
import { dictionaries } from "./messages";

/** Options for the language menu. Languages without approved strings are marked "English for now". */
export function useLanguageOptions() {
  const { t } = useI18n();
  return languages.map((l) => ({
    code: l.code, native: l.native, english: l.english,
    note: l.code === "en" || dictionaries[l.code] ? undefined : t("lang.fallback"),
  }));
}
