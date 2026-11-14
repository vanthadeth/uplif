"use client";
import { useEffect, useRef, useState } from "react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Avatar } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { useAppearance, type Appearance } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/client";
import { pick } from "@/lib/format";
import { AppsSwitcher } from "@/components/apps-switcher";
import { LanguageBar } from "@/components/language-bar";
import { useStock } from "@/components/stock-context";

const modes = [
  { id: "auto", icon: Monitor, key: "sk.theme.auto" },
  { id: "light", icon: Sun, key: "sk.theme.light" },
  { id: "dark", icon: Moon, key: "sk.theme.dark" },
] as const;

/** Top bar: the apps switcher (with company) and the account dropdown (language, appearance, sign out). */
export function AppBar() {
  const { t, locale } = useI18n();
  const { companyName, companyNameLocal } = useStock();
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const company = pick(locale, companyName, companyNameLocal);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface ps-4 pe-2">
      <AppsSwitcher className="flex-1" />
      <div ref={root} className="relative">
        <button ref={btn} type="button" aria-label={t("sk.bar.account")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}
          className="grid size-12 place-items-center rounded-full">
          <Avatar name={company || "?"} size="md" />
        </button>
        {open && (
          <div role="group" aria-label={t("sk.bar.account")}
            className="absolute end-0 top-full z-30 mt-1 w-[min(21rem,calc(100vw-1rem))] origin-top-right animate-[uplif-in_0.15s_ease-out] overflow-hidden rounded-card border border-line bg-surface shadow-pop">
            <div className="flex items-center gap-3 p-4"><Avatar name={company || "?"} size="lg" /><b className="min-w-0 truncate">{company}</b></div>
            <div className="flex min-h-15 items-center justify-between gap-3 border-t border-line px-4 py-2">
              <b>{t("sk.language")}</b><LanguageBar />
            </div>
            <div className="flex min-h-15 items-center justify-between gap-3 border-t border-line px-4 py-2">
              <b>{t("sk.appearance")}</b>
              <div role="radiogroup" aria-label={t("sk.appearance")} className="inline-flex gap-1 rounded-control bg-primary-soft p-1">
                {modes.map(({ id, icon: Icon, key }) => (
                  <button key={id} type="button" role="radio" aria-checked={appearance === id} aria-label={t(key)} onClick={() => setAppearance(id as Appearance)}
                    className={`grid size-11 place-items-center rounded-control transition-colors ${appearance === id ? "bg-surface text-link shadow-sm" : "text-muted"}`}>
                    <Icon className="size-5" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={signOut} className="flex min-h-15 w-full items-center gap-3 border-t border-line px-4 text-start font-semibold text-danger-ink">
              <LogOut className="size-5" aria-hidden />{t("sk.signOut")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
