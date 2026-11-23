"use client";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();
  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("od.home.title")}</h1>
        <p className="mt-1 text-muted">{t("od.home.body")}</p>
      </div>
      <Link href="/customers" className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors active:bg-neutral-soft">
        <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-ink"><Users className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><b className="block">{t("od.home.customers")}</b><span className="text-sm text-muted">{t("od.home.customersBody")}</span></span>
        <ChevronRight className="size-5 text-muted" aria-hidden />
      </Link>
    </main>
  );
}
