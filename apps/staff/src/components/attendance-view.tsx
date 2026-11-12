"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Card, ErrorState, ProgressBar, Skeleton, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { addDays, parseYmd, startOfDay, startOfWeek, workedMinutes, ymd, type EventLite } from "@/lib/format";
import { useMe } from "./me-context";

interface Ev extends EventLite { id?: string }
interface DayResult { day: string; status: string; late_min: number; early_min: number; overtime_min: number }
interface WorkDay { day: string; day_kind: string; hours: number; holiday_name: string | null; holiday_name_local: string | null }

const WEEKS = 4;
const FLAG_KEYS: Record<string, MessageKey> = {
  outside_geofence: "st.flag.outside_geofence", no_gps: "st.flag.no_gps", low_accuracy: "st.flag.low_accuracy",
  clock_drift: "st.flag.clock_drift", missing_selfie: "st.flag.missing_selfie", shared_device: "st.flag.shared_device",
};

/** Attendance by day for the last four weeks. Loaded in the browser so "today" and the week follow the phone's own calendar. */
export function AttendanceView() {
  const state = useMe();
  const { t, locale } = useI18n();
  const { time, duration: dur, tag } = useFormat();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [days, setDays] = useState<WorkDay[]>([]);
  const [results, setResults] = useState<DayResult[]>([]);
  const [failed, setFailed] = useState(false);
  const [week, setWeek] = useState(0); // 0 = this week, -1 = last week, ...
  const [now, setNow] = useState<Date | null>(null);

  const employeeId = state.employee_id;
  const load = useCallback(async () => {
    if (!employeeId) return;
    setFailed(false);
    const today = new Date();
    const from = addDays(startOfWeek(today), -7 * (WEEKS - 1));
    const supabase = createClient();
    const [ev, wd, rs] = await Promise.all([
      supabase.from("attendance_events").select("kind, occurred_at, flags").eq("employee_id", employeeId)
        .gte("occurred_at", from.toISOString()).order("occurred_at", { ascending: true }).limit(1000),
      supabase.rpc("employee_work_days", { p_employee_id: employeeId, p_from: ymd(from), p_days: WEEKS * 7 }),
      supabase.rpc("employee_attendance_days", { p_employee_id: employeeId, p_from: ymd(from), p_days: WEEKS * 7 }),
    ]);
    if (ev.error) { setFailed(true); return; }
    setEvents(ev.data as Ev[]);
    setDays(!wd.error && wd.data ? (wd.data as WorkDay[]) : []);
    setResults(!rs.error && rs.data ? (rs.data as DayResult[]) : []);
    setNow(today);
  }, [employeeId]);
  useEffect(() => { void load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events ?? []) {
      const k = ymd(new Date(e.occurred_at));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [events]);
  const schedule = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const result = useMemo(() => new Map(results.map((r) => [r.day, r])), [results]);


  if (failed) {
    return <ErrorState title={t("st.att.error")} action={<Button onClick={() => void load()}>{t("st.att.retry")}</Button>} />;
  }
  if (!events || !now) {
    return <div className="flex flex-col gap-3" role="status" aria-label={t("st.att.loading")}><Skeleton className="h-12" /><Skeleton className="h-16" /><Skeleton className="h-40" /></div>;
  }

  const today = startOfDay(now);
  const monday = addDays(startOfWeek(today), week * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const rows = weekDays.map((d) => {
    const key = ymd(d);
    const evs = byDay.get(key) ?? [];
    const sched = schedule.get(key);
    const isToday = key === ymd(today);
    const future = d > today;
    const holiday = sched ? ((locale !== "en" && sched.holiday_name_local) || sched.holiday_name) : null;
    const worked = workedMinutes(evs, now, isToday);
    const open = isToday && evs.length > 0 && evs[evs.length - 1].kind === "in";
    const flagged = evs.some((e) => e.flags.length > 0);
    const res = result.get(key);
    const dayOff = !!sched && !holiday && (sched.day_kind === "off" || sched.day_kind === "none" || sched.day_kind === "not_employed");
    const planned = sched && !holiday && !dayOff ? Number(sched.hours) : 0;
    return { d, key, evs, worked, open, flagged, holiday, dayOff, planned, isToday, future, res };
  });
  const totalWorked = rows.reduce((s, r) => s + r.worked, 0);
  const totalPlanned = Math.round(rows.reduce((s, r) => s + r.planned, 0) * 60);
  const problem = (r: (typeof rows)[number]) => ["late", "early_leave", "incomplete"].includes(r.res?.status ?? "");
  const dot = (r: (typeof rows)[number]) => r.res?.status === "absent" ? "bg-danger" : r.flagged || problem(r) ? "bg-warning" : r.holiday ? "bg-primary" : r.evs.length > 0 ? "bg-success" : "border-[1.5px] border-line-strong";
  const label = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(tag, opts);
  const list = rows.filter((r) => !r.future || r.holiday).slice().reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col"><span className="caps text-xs font-bold text-muted">{week === 0 ? t("st.att.week") : fill(t("st.att.week.other"), { date: label(monday, { day: "numeric", month: "short" }) })}</span>
          <b>{totalPlanned > 0 ? fill(t("st.att.hours"), { worked: dur(totalWorked), total: dur(totalPlanned) }) : dur(totalWorked)}</b></div>
        <div className="flex gap-2">
          <Button aria-label={t("st.att.prev")} disabled={week <= -(WEEKS - 1)} onClick={() => setWeek(week - 1)} className="w-11 px-0"><ChevronLeft className="size-5 rtl:rotate-180" aria-hidden /></Button>
          <Button aria-label={t("st.att.next")} disabled={week >= 0} onClick={() => setWeek(week + 1)} className="w-11 px-0"><ChevronRight className="size-5 rtl:rotate-180" aria-hidden /></Button>
        </div>
      </div>
      {totalPlanned > 0 && <ProgressBar value={(totalWorked / totalPlanned) * 100} label={fill(t("st.att.hours"), { worked: dur(totalWorked), total: dur(totalPlanned) })} />}
      <ol className="grid grid-cols-7 gap-1.5" aria-hidden>
        {rows.map((r) => (
          <li key={r.key} className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs text-muted ${r.isToday ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}>
            <span>{label(r.d, { weekday: "narrow" })}</span><b className="text-sm text-ink">{r.d.getDate()}</b><i className={`size-2 rounded-full ${dot(r)}`} />
          </li>
        ))}
      </ol>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {list.map((r) => {
            const st = r.res?.status;
            const tone: BadgeTone = r.open ? "success" : st === "absent" ? "danger" : r.flagged || problem(r) ? "warning" : r.holiday ? "info" : st === "extra" ? "info" : st === "on_time" ? "success" : "neutral";
            const text = r.open ? t("st.att.inprogress")
              : st === "late" ? fill(t("st.att.late"), { m: dur(r.res!.late_min) })
              : st === "early_leave" ? fill(t("st.att.early"), { m: dur(r.res!.early_min) })
              : st === "incomplete" ? t("st.att.incomplete")
              : st === "absent" ? t("st.att.absent")
              : st === "extra" ? t("st.att.extra")
              : r.flagged ? t("st.att.review") : r.holiday ? t("st.att.holiday")
              : r.evs.length > 0 ? t(st === "on_time" ? "st.att.ontime" : "st.att.ok") : r.dayOff ? t("st.att.off") : t("st.att.none");
            const first = r.evs[0], last = r.evs[r.evs.length - 1];
            const range = first ? `${time(first.occurred_at)} – ${r.open ? "…" : last.kind === "out" ? time(last.occurred_at) : ""}` : r.holiday ?? "";
            const flags = Array.from(new Set(r.evs.flatMap((e) => e.flags)));
            return (
              <li key={r.key} className={`flex flex-col gap-2 p-4 ${r.flagged ? "bg-warning-soft" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><b className="block">{label(r.d, { weekday: "short", day: "numeric", month: "short" })}</b>
                    <span className="text-sm text-muted">{range}{r.worked > 0 ? ` · ${dur(r.worked)}` : ""}{r.res && r.res.overtime_min > 0 ? ` · ${fill(t("st.att.overtime"), { m: dur(r.res.overtime_min) })}` : ""}</span></div>
                  <Badge tone={tone}>{text}</Badge>
                </div>
                {r.flagged && <ul className="list-disc ps-5 text-sm">{flags.map((f) => <li key={f}>{FLAG_KEYS[f] ? t(FLAG_KEYS[f]) : f}</li>)}</ul>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
