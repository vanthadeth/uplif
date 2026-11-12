"use client";
import { EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** Policies and the playbook arrive in a later release; the tab is here so people learn where they will be. */
export default function LearnPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.learn.title")}</h1>
      <EmptyState title={t("st.learn.empty.title")} body={t("st.learn.empty.body")} />
    </div>
  );
}
