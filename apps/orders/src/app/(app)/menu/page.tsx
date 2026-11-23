"use client";
import { useI18n } from "@/lib/i18n";

export default function MenuPage() {
  const { t } = useI18n();
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("od.menu.title")}</h1>
    </main>
  );
}
