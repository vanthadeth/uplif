"use client";
import { useState } from "react";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { Card, LanguageToggle } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { useAppearance, type Appearance } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/client";
import { LanguageBar } from "@/components/language-bar";

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="px-1 text-sm font-semibold text-muted">{title}</h2>
    <Card className="divide-y divide-line">{children}</Card>
  </section>
);

/** Menu: preferences, privacy and help, grouped. Rows are touch-sized. */
export default function MenuPage() {
  const { t } = useI18n();
  const { appearance, setAppearance } = useAppearance();
  const [privacy, setPrivacy] = useState(false);
  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }
  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.menu.title")}</h1>
      <Group title={t("st.menu.preferences")}>
        <div className="flex min-h-15 items-center justify-between gap-3 p-4">
          <div><b className="block">{t("st.me.language")}</b><span className="text-sm text-muted">{t("st.me.language.hint")}</span></div>
          <LanguageBar />
        </div>
        <div className="flex min-h-15 items-center justify-between gap-3 p-4">
          <b>{t("st.me.appearance")}</b>
          <LanguageToggle label={t("st.me.appearance")} value={appearance} onChange={(v) => setAppearance(v as Appearance)}
            options={[{ id: "auto", label: t("st.theme.auto") }, { id: "light", label: t("st.theme.light") }, { id: "dark", label: t("st.theme.dark") }]} />
        </div>
      </Group>
      <Group title={t("st.menu.privacy")}>
        <div>
          <button type="button" aria-expanded={privacy} onClick={() => setPrivacy(!privacy)} className="flex min-h-15 w-full items-center gap-3 p-4 text-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><ShieldCheck className="size-4" aria-hidden /></span>
            <b className="min-w-0 flex-1">{t("st.me.privacy")}</b>
            <ChevronDown className={`size-5 text-muted transition-transform ${privacy ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {privacy && <p className="px-4 pb-4 text-muted">{t("st.privacy.body")}</p>}
        </div>
      </Group>
      <button type="button" onClick={signOut} className="flex min-h-15 items-center justify-center gap-2 rounded-card border border-line bg-surface font-semibold text-danger-ink">
        <LogOut className="size-5" aria-hidden />{t("st.signOut")}
      </button>
      <p className="text-center text-xs text-muted">{t("st.app")}</p>
    </div>
  );
}
