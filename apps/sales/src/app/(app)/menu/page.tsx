"use client";
import { LogOut } from "lucide-react";
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
  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }
  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.menu.title")}</h1>
      <Group title={t("go.menu.preferences")}>
        <div className="flex min-h-15 items-center justify-between gap-3 p-4">
          <div><b>{t("go.language")}</b></div>
          <LanguageBar />
        </div>
        <div className="flex min-h-15 items-center justify-between gap-3 p-4">
          <b>{t("go.menu.appearance")}</b>
          <LanguageToggle label={t("go.menu.appearance")} value={appearance} onChange={(v) => setAppearance(v as Appearance)}
            options={[{ id: "auto", label: t("go.theme.auto") }, { id: "light", label: t("go.theme.light") }, { id: "dark", label: t("go.theme.dark") }]} />
        </div>
      </Group>
      <button type="button" onClick={signOut} className="flex min-h-15 items-center justify-center gap-2 rounded-card border border-line bg-surface font-semibold text-danger-ink">
        <LogOut className="size-5" aria-hidden />{t("go.signOut")}
      </button>
      <p className="text-center text-xs text-muted">{t("go.app")}</p>
    </div>
  );
}
