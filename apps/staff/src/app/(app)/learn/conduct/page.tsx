"use client";
import { LearnBack } from "@/components/learn-back";
import { PoliciesView } from "@/components/policies-view";
import { useI18n } from "@/lib/i18n";

export default function LearnConductPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <LearnBack title={t("st.learn.tile.conduct")} />
      <PoliciesView kind="conduct" />
    </div>
  );
}
