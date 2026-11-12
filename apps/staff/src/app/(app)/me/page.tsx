"use client";
import { useState } from "react";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { Avatar, Button, Card, LanguageToggle } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { useAppearance, type Appearance } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/client";
import { LanguageBar } from "@/components/language-bar";
import { useDisplay, useMe } from "@/components/me-context";

export default function MePage() {
  const state = useMe();
  const { t, locale } = useI18n();
  const { name, branch } = useDisplay(state, locale);
  const { appearance, setAppearance } = useAppearance();
  const [privacy, setPrivacy] = useState(false);
  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.me.title")}</h1>
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} size="lg" />
        <div className="min-w-0"><b className="block truncate text-lg">{name}</b>{branch && <span className="text-muted">{branch}</span>}</div>
      </div>
      <Card className="divide-y divide-line">
        <div className="flex items-center justify-between gap-3 p-4">
          <div><b className="block">{t("st.me.language")}</b><span className="text-sm text-muted">{t("st.me.language.hint")}</span></div>
          <LanguageBar />
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <b>{t("st.me.appearance")}</b>
          <LanguageToggle label={t("st.me.appearance")} value={appearance} onChange={(v) => setAppearance(v as Appearance)}
            options={[{ id: "auto", label: t("st.theme.auto") }, { id: "light", label: t("st.theme.light") }, { id: "dark", label: t("st.theme.dark") }]} />
        </div>
        <div>
          <button type="button" aria-expanded={privacy} onClick={() => setPrivacy(!privacy)} className="flex w-full items-center gap-3 p-4 text-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><ShieldCheck className="size-4" aria-hidden /></span>
            <b className="min-w-0 flex-1">{t("st.me.privacy")}</b>
            <ChevronDown className={`size-5 text-muted transition-transform ${privacy ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {privacy && <p className="px-4 pb-4 text-muted">{t("st.privacy.body")}</p>}
        </div>
      </Card>
      <Button variant="secondary" className="h-13 text-danger-ink!" onClick={signOut}><LogOut className="size-4" aria-hidden />{t("st.signOut")}</Button>
      <p className="text-center text-xs text-muted">{t("st.app")}</p>
    </div>
  );
}
