"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, km, type MessageKey } from "./messages";

export type Locale = "en" | "km";
interface I18n { locale: Locale; setLocale: (l: Locale) => void; t: (k: MessageKey) => string }
const Ctx = createContext<I18n>({ locale: "en", setLocale: () => {}, t: (k) => en[k] });
export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("uplif.locale");
      if (saved === "km" || saved === "en") set(saved);
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    set(l);
    try { localStorage.setItem("uplif.locale", l); } catch {}
  }, []);
  // Missing Khmer strings fall back to English.
  const t = useCallback((k: MessageKey) => (locale === "km" ? km[k] ?? en[k] : en[k]), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
