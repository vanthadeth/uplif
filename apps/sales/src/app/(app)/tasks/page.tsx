"use client";
import { EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";


export default function Page() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.tasks.title")}</h1>
      <EmptyState title={t("go.soon")} body={t("go.tasks.empty")} />
    </div>
  );
}
