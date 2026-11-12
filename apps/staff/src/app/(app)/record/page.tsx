"use client";
import Link from "next/link";
import { Award, BriefcaseBusiness, CalendarDays, ChevronRight, Clock, TrendingUp, TriangleAlert } from "lucide-react";
import { Avatar, Badge, Card } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { useDisplay, useMe } from "@/components/me-context";
import type { MessageKey } from "@/lib/messages";

const soon: { icon: typeof Award; key: MessageKey }[] = [
  { icon: BriefcaseBusiness, key: "st.record.jd" },
  { icon: TrendingUp, key: "st.record.perf" },
  { icon: TriangleAlert, key: "st.record.warn" },
  { icon: CalendarDays, key: "st.record.leave" },
];

/** The person's working record. Attendance is live; the other sections are listed so people know they are coming. */
export default function RecordPage() {
  const state = useMe();
  const { t, locale } = useI18n();
  const { name, branch } = useDisplay(state, locale);
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.record.title")}</h1>
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} size="lg" />
        <div className="min-w-0"><b className="block truncate text-lg">{name}</b>{branch && <span className="text-muted">{branch}</span>}</div>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        <Link href="/record/attendance" className="flex items-center gap-3 p-4 hover:bg-ground">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-success-soft text-success-ink"><Clock className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1"><b className="block">{t("st.record.attendance")}</b><span className="text-sm text-muted">{t("st.record.attendance.sub")}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        <Link href="/record/achievements" className="flex items-center gap-3 p-4 hover:bg-ground">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-success-soft text-success-ink"><Award className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1"><b className="block">{t("st.record.ach")}</b><span className="text-sm text-muted">{t("st.record.ach.sub")}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        {soon.map(({ icon: Icon, key }) => (
          <div key={key} className="flex items-center gap-3 p-4 opacity-75">
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
