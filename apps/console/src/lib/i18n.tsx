"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries, en, type MessageKey } from "./messages";
import { isLocale, type Locale } from "./languages";

export type { Locale };
interface I18n { locale: Locale; setLocale: (l: Locale) => void; t: (k: MessageKey) => string }
const Ctx = createContext<I18n>({ locale: "en", setLocale: () => {}, t: (k) => en[k] });
export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("uplif.locale");
      if (isLocale(saved)) set(saved);
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    set(l);
    try { localStorage.setItem("uplif.locale", l); } catch {}
  }, []);
  // A language without approved strings, or a missing key, falls back to English.
  const t = useCallback((k: MessageKey) => dictionaries[locale]?.[k] ?? en[k], [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
