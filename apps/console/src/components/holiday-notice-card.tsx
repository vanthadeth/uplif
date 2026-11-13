"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Badge, Button, Card, CardBody, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

export interface HolidayNotice { year: number; holiday_count: number; provisional: boolean }

/** Says that next year's public holidays are ready to import. Shared by the owner dashboard (card) and the Holidays page (banner). */
export function HolidayNotice({ notice, variant, onReview }: { notice: HolidayNotice; variant: "card" | "banner"; onReview?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const f = (k: MessageKey) => t(k).replace("{year}", String(notice.year)).replace("{n}", String(notice.holiday_count));

  async function dismiss() {
    setBusy(true);
    const { error } = await createClient().rpc("dismiss_holiday_notice", { p_year: notice.year });
    setBusy(false);
    if (error) return toast("error", t(error.code === "42501" ? "common.forbidden" : "common.saveError"));
    router.refresh();
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {variant === "card"
        ? <Link href={`/holidays?import=${notice.year}`} className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white">{f("hol.notice.review")}</Link>
        : <Button variant="primary" onClick={onReview}>{f("hol.notice.review")}</Button>}
      <Button loading={busy} onClick={dismiss}>{t("hol.notice.dismiss")}</Button>
    </div>
  );
  const body = (
    <>
      <b className="block text-[16px] font-semibold">{f("hol.notice.title")}</b>
      <span className="block text-[14px] leading-snug text-muted">{f("hol.notice.body")}</span>
      {notice.provisional && <span className="block text-[14px] leading-snug text-warning-ink">{t("hol.notice.provisional")}</span>}
    </>
  );
  if (variant === "banner") {
    return (
      <div role="note" className="flex flex-col gap-3 rounded-card bg-primary-soft p-4 text-primary-ink sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden /><div className="flex flex-col gap-0.5">{body}</div></div>
        {actions}
      </div>
    );
  }
  return (
    <Card><CardBody className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 text-[16px] font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden />{f("hol.notice.cardTitle")}</h2>
        <Badge tone="info">{f("hol.notice.count")}</Badge>
      </div>
      <div className="flex flex-col gap-0.5">{body}</div>
      {actions}
    </CardBody></Card>
  );
}
