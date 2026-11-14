"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries, en, type MessageKey } from "./messages";
import { isLocale, type Locale } from "./languages";
import { createClient } from "./supabase/client";
import { supabaseUrl } from "./supabase/env";

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
  // The community's shown text (pinned, else top voted, else machine draft) wins over the bundled text.
  // It is cached per language so the next visit paints at once, then refreshed in the background.
  const [shown, setShown] = useState<{ locale: string; text: Record<string, string> }>({ locale: "", text: {} });
  useEffect(() => {
    if (locale === "en" || !supabaseUrl) return;
    let live = true;
    const cacheKey = `uplif.shown.${locale}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) setShown({ locale, text: JSON.parse(raw) });
    } catch {}
    createClient().rpc("i18n_display" as never, { p_lang: locale } as never).then(({ data: raw }) => {
      const data = raw as unknown;
      if (!live || !Array.isArray(data) || data.length === 0) return;
      const text: Record<string, string> = {};
      for (const r of data as { string_key: string; text: string }[]) text[r.string_key] = r.text;
      setShown({ locale, text });
      try { localStorage.setItem(cacheKey, JSON.stringify(text)); } catch {}
    });
    return () => { live = false; };
  }, [locale]);
  // Missing keys, and languages with no text yet, fall back to English.
  const t = useCallback((k: MessageKey) => (shown.locale === locale ? shown.text[k] : undefined) ?? dictionaries[locale]?.[k] ?? en[k], [locale, shown]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
