"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";
import { Avatar } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useAppearance, type Appearance } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/client";
import { LanguageBar } from "@/components/language-bar";
import { useNotifications } from "@/components/notifications-context";
import { usePicture } from "@/components/picture-context";
import { localName, useDisplay, useMe, useProfile } from "@/components/me-context";

const modes = [
  { id: "auto", icon: Monitor, key: "st.theme.auto" },
  { id: "light", icon: Sun, key: "st.theme.light" },
  { id: "dark", icon: Moon, key: "st.theme.dark" },
] as const;

/** Top bar: company name, notifications and the account dropdown (language, appearance, menu, sign out). Touch-sized rows. */
export function AppBar() {
  const { t, locale } = useI18n();
  const state = useMe();
  const profile = useProfile();
  const { name } = useDisplay(state, locale);
  const picture = usePicture();
  const { unread } = useNotifications();
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const company = localName(profile?.company, locale) ?? t("st.app");
  const role = localName(profile?.position, locale) ?? t("st.bar.role");

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
      <b className="min-w-0 flex-1 truncate text-lg">{company}</b>
      <Link href="/notifications" aria-label={unread > 0 ? fill(t("st.bar.unread"), { n: unread }) : t("st.bar.notifications")} className="relative grid size-12 place-items-center rounded-full text-muted transition-colors hover:bg-primary-soft">
        <Bell className="size-6" aria-hidden />
        {unread > 0 && <span aria-hidden className="absolute end-2 top-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[13px] font-bold leading-5 text-white">{unread > 9 ? "9+" : unread}</span>}
      </Link>
      <div ref={root} className="relative">
        <button ref={btn} type="button" aria-label={t("st.bar.account")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}
          className="grid size-12 place-items-center rounded-full">
          <Avatar name={name || "?"} src={picture.src} size="md" />
        </button>
        {open && (
          <div role="group" aria-label={t("st.bar.account")}
            className="absolute end-0 top-full z-30 mt-1 w-[min(21rem,calc(100vw-1rem))] origin-top-right animate-[uplif-in_0.15s_ease-out] overflow-hidden rounded-card border border-line bg-surface shadow-pop">
            <div className="flex items-center gap-3 p-4">
              <Avatar name={name || "?"} src={picture.src} size="lg" />
              <div className="min-w-0"><b className="block truncate">{name}</b><span className="block truncate text-sm text-muted">{role}</span></div>
            </div>
            <div className="flex min-h-15 items-center justify-between gap-3 border-t border-line px-4 py-2">
              <b>{t("st.me.language")}</b><LanguageBar />
            </div>
            <div className="flex min-h-15 items-center justify-between gap-3 border-t border-line px-4 py-2">
              <b>{t("st.me.appearance")}</b>
              <div role="radiogroup" aria-label={t("st.me.appearance")} className="inline-flex gap-1 rounded-control bg-primary-soft p-1">
                {modes.map(({ id, icon: Icon, key }) => (
                  <button key={id} type="button" role="radio" aria-checked={appearance === id} aria-label={t(key)} onClick={() => setAppearance(id as Appearance)}
                    className={`grid size-11 place-items-center rounded-control transition-colors ${appearance === id ? "bg-surface text-link shadow-sm" : "text-muted"}`}>
                    <Icon className="size-5" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
            <Link href="/menu" onClick={() => setOpen(false)} className="flex min-h-15 items-center gap-3 border-t border-line px-4 font-semibold">
              <Menu className="size-5 text-muted" aria-hidden /><span className="flex-1">{t("st.menu.title")}</span><ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
            </Link>
            <button type="button" onClick={signOut} className="flex min-h-15 w-full items-center gap-3 border-t border-line px-4 text-start font-semibold text-danger-ink">
              <LogOut className="size-5" aria-hidden />{t("st.signOut")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
