"use client";
import { LearnBack } from "@/components/learn-back";
import { PlaybookList } from "@/components/playbook-view";
import { useI18n } from "@/lib/i18n";

export default function LearnPlaybookPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <LearnBack title={t("st.learn.tile.playbook")} />
      <PlaybookList />
    </div>
  );
}
