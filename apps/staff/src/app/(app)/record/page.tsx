"use client";
import { BriefcaseBusiness, CalendarDays, ChevronRight, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { RecordSummary } from "@/components/record-summary";
import type { MessageKey } from "@/lib/messages";

const soon: { icon: typeof TrendingUp; key: MessageKey }[] = [
  { icon: TriangleAlert, key: "st.record.warn" },
];

/** The person's working record. Attendance and achievements are live; the rest are listed so people know they are coming. */
export default function RecordPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.record.title")}</h1>
      <RecordSummary />
      <h2 className="px-1 pt-2 text-sm font-semibold text-muted">{t("st.record.more")}</h2>
      <Card className="divide-y divide-line overflow-hidden">
        <Link href="/record/leave" className="flex min-h-15 items-center gap-3 p-4 hover:bg-ground">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><CalendarDays className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1"><b className="block">{t("st.record.leave")}</b><span className="text-sm text-muted">{t("st.record.leave.sub")}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        <Link href="/record/performance" className="flex min-h-15 items-center gap-3 p-4 hover:bg-ground">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><TrendingUp className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1"><b className="block">{t("st.perf.title")}</b><span className="text-sm text-muted">{t("st.record.perf.sub")}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        <Link href="/record/job" className="flex min-h-15 items-center gap-3 p-4 hover:bg-ground">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><BriefcaseBusiness className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1"><b className="block">{t("st.job.title")}</b><span className="text-sm text-muted">{t("st.record.jd.sub")}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        {soon.map(({ icon: Icon, key }) => (
          <div key={key} className="flex min-h-15 items-center gap-3 p-4 opacity-75">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-neutral-soft text-muted"><Icon className="size-4" aria-hidden /></span>
            <b className="min-w-0 flex-1">{t(key)}</b>
            <Badge>{t("st.soon")}</Badge>
          </div>
        ))}
      </Card>
      <p className="text-sm text-muted">{t("st.record.note")}</p>
    </div>
  );
}
