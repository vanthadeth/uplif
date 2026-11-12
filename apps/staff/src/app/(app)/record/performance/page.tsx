"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PerformanceView } from "@/components/performance-view";

export default function PerformancePage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-1 pt-1">
        <Link href="/record" aria-label={t("st.back")} className="grid size-11 place-items-center rounded-control hover:bg-ground"><ChevronLeft className="size-6 rtl:rotate-180" aria-hidden /></Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("st.perf.title")}</h1>
      </div>
      <PerformanceView />
    </div>
  );
}
