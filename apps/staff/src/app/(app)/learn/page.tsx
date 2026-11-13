"use client";
import { LearnHub } from "@/components/learn-hub";
import { useI18n } from "@/lib/i18n";

/** The Learn landing page. The playbook, onboarding and announcements arrive in later releases. */
export default function LearnPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.learn.title")}</h1>
      <LearnHub />
    </div>
  );
}
