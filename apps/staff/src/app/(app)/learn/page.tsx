"use client";
import { useI18n } from "@/lib/i18n";
import { PoliciesView } from "@/components/policies-view";

/** Company policies to read and confirm. The playbook arrives in a later release. */
export default function LearnPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.learn.title")}</h1>
      <PoliciesView />
    </div>
  );
}
