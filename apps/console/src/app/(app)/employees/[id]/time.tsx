"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { Avatar, Badge, Button, Card, CardBody } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { languageOf } from "@/lib/languages";
import { pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";
import { AssignScheduleModal, type Named } from "@/components/assign-schedule-modal";
import { hhmm, type AssignScope } from "@/lib/working-time";

interface WorkDay { day: string; day_kind: string; schedule_id: string | null; source: AssignScope | null; start_time: string | null; end_time: string | null; break_min: number | null; hours: number }

interface Props {
  employee: { id: string; name: string; name_local: string | null; branch_id: string | null; department_id: string | null };
  /** null when the caller may not read this employee's schedule. */
  week: WorkDay[] | null;
  today: string;
  canManage: boolean;
  schedules: Named[];
  allSchedules: Named[];
  branches: Named[];
  departments: Named[];
}

const tile: Record<string, string> = {
  work: "bg-surface", half: "bg-warning-soft", off: "bg-ground text-muted", none: "bg-ground text-muted", not_employed: "bg-ground text-muted line-through",
};

/** What one employee is expected to do over the next two weeks, as the database resolver answers it. */
export function TimeAndLeave({ employee, week, today, schedules, allSchedules, branches, departments, canManage }: Props) {
  const { t, locale } = useI18n();
  const [assigning, setAssigning] = useState(false);
  const tag = languageOf(locale).dateTag;
  const nf = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const name = pick(locale, employee.name, employee.name_local);
  const first = week?.[0];
  const sched = first?.schedule_id ? allSchedules.find((s) => s.id === first.schedule_id) : undefined;
  const dow = (iso: string) => new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const dom = (iso: string) => new Intl.NumberFormat(tag).format(Number(iso.slice(8, 10)));
  const source = first?.source === "employee" ? "wt.emp.src.employee" : first?.source === "department" ? "wt.emp.src.department" : first?.source === "branch" ? "wt.emp.src.branch" : "wt.emp.src.company";
  const kindKey = (k: string) => `wt.emp.day.${k}` as MessageKey;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/employees" className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-primary-ink"><ArrowLeft className="size-4" aria-hidden />{t("wt.emp.back")}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={name} />
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">{name}</h1>
            <p className="m-0 flex items-center gap-1.5 text-muted"><CalendarClock className="size-4" aria-hidden />{t("wt.emp.title")}</p>
          </div>
        </div>
        {canManage && <Button onClick={() => setAssigning(true)}>{t("wt.emp.assign")}</Button>}
      </div>

      {week === null ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">{t("common.forbidden")}</div>
      ) : (
        <>
          <Card><CardBody className="flex flex-col gap-1.5">
            <small className="text-[13px] text-muted">{t("wt.emp.eff")}</small>
            {sched ? (
              <>
                <b className="text-[17px]">{pick(locale, sched.name, sched.name_local)}</b>
                <small className="text-[13px] text-muted">{t(source)}</small>
              </>
            ) : first?.day_kind === "not_employed" ? (
              <b>{t("wt.emp.notEmployed")}</b>
            ) : (
              <>
                <b>{t("wt.emp.none")}</b>
                <small className="text-[13px] text-muted">{t("wt.emp.noneBody")}</small>
              </>
            )}
          </CardBody></Card>

          <section aria-labelledby="wt-next" className="flex flex-col gap-2.5">
            <h2 id="wt-next" className="m-0 text-[15px] font-semibold">{t("wt.emp.next")}</h2>
            <ul className="m-0 grid list-none grid-cols-7 gap-1.5 p-0">
              {week.map((d) => (
                <li key={d.day} className={`min-w-0 rounded-control border px-1 py-1.5 text-center text-xs ${tile[d.day_kind] ?? "bg-surface"} ${d.day === today ? "border-primary" : "border-line"}`}
                  title={d.start_time ? `${hhmm(d.start_time)}–${hhmm(d.end_time)}` : t(kindKey(d.day_kind))}>
                  <small className="block text-muted">{dow(d.day)}</small>
                  <b className="block text-[13px]">{dom(d.day)}</b>
                  <small className="block text-muted">{d.day_kind === "work" || d.day_kind === "half" ? `${nf.format(d.hours)} h` : "–"}</small>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[13px] text-muted">{t("wt.emp.nextHint")}</p>
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <Badge tone="neutral">{t("wt.emp.day.work")}</Badge><Badge tone="warning">{t("wt.emp.day.half")}</Badge><Badge tone="neutral">{t("wt.emp.day.off")}</Badge>
            </div>
          </section>
        </>
      )}

      <AssignScheduleModal open={assigning} onClose={() => setAssigning(false)} schedules={schedules} branches={branches} departments={departments}
        employees={[{ id: employee.id, name: employee.name, name_local: employee.name_local }]} today={today} scope="employee" targetId={employee.id} fixedTarget />
    </div>
  );
}
