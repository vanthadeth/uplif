"use client";
import { LanguageToggle } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** English and Khmer for now; more languages follow the console once the staff app strings are reviewed. */
export function LanguageBar() {
  const { locale, setLocale, t } = useI18n();
  return (
    <LanguageToggle label={t("go.language")} value={locale === "km" ? "km" : "en"} onChange={setLocale}
      options={[{ id: "en", label: "EN" }, { id: "km", label: "ខ្មែរ" }]} />
  );
}
