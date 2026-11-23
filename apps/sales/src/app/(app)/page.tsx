"use client";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button, EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/me-context";

/** Today: Clock in and Check in arrive with the visits release (slice 3). Until then it points to customers. */
export default function TodayPage() {
  const { t } = useI18n();
  const me = useMe();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.today.title")}</h1>
      <EmptyState title={t("go.soon")} body={t("go.today.empty")}
        action={me.can_create ? <Link href="/customers/new"><Button variant="primary"><UserPlus className="size-4" aria-hidden />{t("go.today.newCustomer")}</Button></Link> : undefined} />
    </div>
  );
}
