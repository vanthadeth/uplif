"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@uplif/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@uplif/supabase/env";
import { dictionaries, en, type MessageKey } from "./messages";
import { isLocale } from "./languages";

type Vars = Record<string, string | number>;
interface I18n { locale: string; setLocale: (l: string) => void; t: (k: MessageKey, vars?: Vars) => string }
const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m)) : text);
const Ctx = createContext<I18n>({ locale: "en", setLocale: () => {}, t: (k, v) => fill(en[k], v) });
export const useI18n = () => useContext(Ctx);

/**
 * Same behavior as the other apps: bundled English and Khmer paint at once, then the community's shown text
 * (pinned, else top voted, else machine draft) replaces it. The signed-out page can read it because
 * i18n_display is open to everyone. The saved language is shared with the other UPLIF apps on this device only.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("uplif.locale");
      if (isLocale(saved)) set(saved);
      else if (navigator.language?.toLowerCase().startsWith("km")) set("km");
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: string) => {
    set(l);
    try { localStorage.setItem("uplif.locale", l); } catch {}
  }, []);

  const [shown, setShown] = useState<{ locale: string; text: Record<string, string> }>({ locale: "", text: {} });
  useEffect(() => {
    if (locale === "en" || !supabaseUrl || !supabasePublishableKey) return;
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

  const t = useCallback((k: MessageKey, vars?: Vars) =>
    fill((shown.locale === locale ? shown.text[k] : undefined) ?? dictionaries[locale]?.[k] ?? en[k], vars), [locale, shown]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
