"use client";
import { ExternalLink, Settings2 } from "lucide-react";
import { APPS } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** Menu: company rules stay in UPLIF Admin, so this points there. Pay plans and the export log join it with payroll. */
export default function MenuPage() {
  const { t } = useI18n();
  const admin = APPS.find((a) => a.key === "admin")?.url ?? "";
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("tm.menu.title")}</h1>
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <span className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-control bg-primary-soft text-primary-ink"><Settings2 className="size-5" aria-hidden /></span><b>{t("tm.menu.admin")}</b></span>
        <p className="text-muted">{t("tm.menu.adminBody")}</p>
        <a href={admin} className="inline-flex h-13 items-center justify-center gap-2 rounded-control border border-line font-semibold"><ExternalLink className="size-4" aria-hidden />{t("tm.menu.openAdmin")}</a>
      </section>
    </main>
  );
}
