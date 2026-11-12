"use client";
import { EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** Nothing sends notifications yet; the page is ready so the bell has somewhere to go. */
export default function NotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.notif.title")}</h1>
      <EmptyState title={t("st.notif.empty.title")} body={t("st.notif.empty.body")} />
    </div>
  );
}
