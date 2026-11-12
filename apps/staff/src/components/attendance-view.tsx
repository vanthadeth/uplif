"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Card, ErrorState, Skeleton, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { addDays, startOfDay, workedMinutes, ymd, type EventLite } from "@/lib/format";
import { useMe } from "./me-context";
import { Amendments } from "./amendments";
import type { MyLeave } from "@/lib/leave";

interface DayResult { day: string; status: string; late_min: number; early_min: number; overtime_min: number }
interface WorkDay { day: string; day_kind: string; hours: number; holiday_name: string | null; holiday_name_local: string | null }

const MONTHS_BACK = 6;
const FLAG_KEYS: Record<string, MessageKey> = {
  outside_geofence: "st.flag.outside_geofence", no_gps: "st.flag.no_gps", low_accuracy: "st.flag.low_accuracy",
  clock_drift: "st.flag.clock_drift", missing_selfie: "st.flag.missing_selfie", shared_device: "st.flag.shared_device",
};
/** Hard-stop diagonal stripes mark holidays; not a gradient look, and readable in light and dark. */
const STRIPES = { backgroundImage: "repeating-linear-gradient(135deg, transparent 0 5px, var(--color-line) 5px 6px)" };

/** Attendance for one month as a calendar: a tap on a day shows its clock-ins below. Loaded in the browser so "today" follows the phone. */
export function AttendanceView() {
  const state = useMe();
  const { t, locale } = useI18n();
  const { time, duration: dur, tag } = useFormat();
  const [events, setEvents] = useState<EventLite[] | null>(null);
  const [days, setDays] = useState<WorkDay[]>([]);
  const [results, setResults] = useState<DayResult[]>([]);
  const [failed, setFailed] = useState(false);
  const [back, setBack] = useState(0); // 0 = this month
  const [picked, setPicked] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [leave, setLeave] = useState<MyLeave["requests"]>([]);
  const employeeId = state.employee_id;

  const load = useCallback(async () => {
    if (!employeeId) return;
    setFailed(false); setEvents(null);
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    const supabase = createClient();
    const [ev, wd, rs, lv] = await Promise.all([
      supabase.from("attendance_events").select("kind, occurred_at, flags").eq("employee_id", employeeId)
        .gte("occurred_at", first.toISOString()).lt("occurred_at", next.toISOString()).order("occurred_at", { ascending: true }).limit(1000),
      supabase.rpc("employee_work_days", { p_employee_id: employeeId, p_from: ymd(first), p_days: count }),
      supabase.rpc("employee_attendance_days", { p_employee_id: employeeId, p_from: ymd(first), p_days: count }),
      supabase.rpc("my_leave"),
    ]);
    if (ev.error) { setFailed(true); return; }
    setEvents(ev.data as EventLite[]);
    setDays(!wd.error && wd.data ? (wd.data as WorkDay[]) : []);
    setResults(!rs.error && rs.data ? (rs.data as DayResult[]) : []);
    setLeave(!lv.error && lv.data ? lv.data.requests : []);
    setNow(today);
  }, [employeeId, back]);
  useEffect(() => { void load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, EventLite[]>();
    for (const e of events ?? []) {
      const k = ymd(new Date(e.occurred_at));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [events]);
  const schedule = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const result = useMemo(() => new Map(results.map((r) => [r.day, r])), [results]);
  /** Leave by day: approved or waiting requests spread over their dates. */
  const leaveByDay = useMemo(() => {
    const m = new Map<string, { code: string; status: string }>();
    for (const r of leave) {
      if (r.status !== "approved" && r.status !== "pending") continue;
      for (let d = new Date(`${r.start_date}T00:00:00`); ymd(d) <= r.end_date; d = addDays(d, 1)) {
        const k = ymd(d);
        if (m.get(k)?.status === "approved") continue;
        m.set(k, { code: r.code, status: r.status });
      }
    }
    return m;
  }, [leave]);

  if (failed) return <ErrorState title={t("st.att.error")} action={<Button onClick={() => void load()}>{t("st.att.retry")}</Button>} />;
  if (!events || !now) {
    return <div className="flex flex-col gap-3" role="status" aria-label={t("st.att.loading")}><Skeleton className="h-12" /><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;
  }

  const today = startOfDay(now);
  const todayKey = ymd(today);
  const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => addDays(first, i - lead));
  const monthLabel = first.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const holidayName = (k: string) => { const s = schedule.get(k); return s ? ((locale !== "en" && s.holiday_name_local) || s.holiday_name) : null; };
  const inMonth = (d: Date) => d.getMonth() === first.getMonth();

  const monthResults = results.filter((r) => r.day <= todayKey);
  const COUNTED = ["on_time", "late", "early_leave", "incomplete", "absent"];
  const present = monthResults.filter((r) => COUNTED.includes(r.status) && r.status !== "absent").length;
  const scheduled = monthResults.filter((r) => COUNTED.includes(r.status)).length;
  const absent = monthResults.filter((r) => r.status === "absent").length;
  const leaveDays = monthResults.filter((r) => r.status === "leave").length;
  const lateMin = monthResults.reduce((s, r) => s + (r.status === "late" ? r.late_min : 0), 0);
  const holidays = days.filter((d) => holidayName(d.day));

  const pill = (k: string) => {
    const l = leaveByDay.get(k);
    if (!l) return null;
    return l.status === "approved"
      ? <b className="rounded-full bg-primary-soft px-1.5 text-[10px] text-link">{l.code}</b>
      : <b className="rounded-full border border-dashed border-primary px-1.5 text-[10px] text-link">{l.code}</b>;
  };
  const mark = (k: string, past: boolean) => {
    const r = result.get(k);
    if (holidayName(k)) return null;
    if (leaveByDay.has(k) && !(byDay.get(k)?.length)) return pill(k);
    if (r?.status === "absent") return <b className="text-xs text-danger">A</b>;
    if (r?.status === "late") return <b className="text-[11px] text-warning">{r.late_min}m</b>;
    if (r?.status === "on_time" || r?.status === "extra" || r?.status === "early_leave") return <Check className="size-4 text-success" aria-hidden />;
    return past && (byDay.get(k)?.length ?? 0) > 0 ? <Check className="size-4 text-success" aria-hidden /> : null;
  };

  const sel = picked ?? (back === 0 ? todayKey : null);
  const selDate = sel ? new Date(`${sel}T00:00:00`) : null;
  const evs = sel ? byDay.get(sel) ?? [] : [];
  const res = sel ? result.get(sel) : undefined;
  const selSched = sel ? schedule.get(sel) : undefined;
  const selHoliday = sel ? holidayName(sel) : null;
  const flags = Array.from(new Set(evs.flatMap((e) => e.flags)));
  const open = sel === todayKey && evs.length > 0 && evs[evs.length - 1].kind === "in";
  const worked = workedMinutes(evs, now, sel === todayKey);
  const st = res?.status;
  const dayOff = !!selSched && !selHoliday && ["off", "none", "not_employed"].includes(selSched.day_kind);
  const tone: BadgeTone = st === "leave" ? "info" : open ? "success" : st === "absent" ? "danger" : flags.length || st === "late" || st === "early_leave" || st === "incomplete" ? "warning" : selHoliday || st === "extra" ? "info" : st === "on_time" ? "success" : "neutral";
  const text = st === "leave" ? t("st.att.leave") : open ? t("st.att.inprogress")
    : st === "late" ? fill(t("st.att.late"), { m: dur(res!.late_min) })
    : st === "early_leave" ? fill(t("st.att.early"), { m: dur(res!.early_min) })
    : st === "incomplete" ? t("st.att.incomplete") : st === "absent" ? t("st.att.absent") : st === "extra" ? t("st.att.extra")
    : flags.length ? t("st.att.review") : selHoliday ? t("st.att.holiday")
    : evs.length ? t(st === "on_time" ? "st.att.ontime" : "st.att.ok") : dayOff ? t("st.att.off") : t("st.att.none");
  const first0 = evs[0], last0 = evs[evs.length - 1];
  const range = first0 ? `${time(first0.occurred_at)} – ${open ? "…" : last0.kind === "out" ? time(last0.occurred_at) : ""}` : selHoliday ?? "";

  const tile = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5 rounded-control bg-ground p-2.5 text-center"><b className="text-lg leading-tight">{value}</b><span className="text-xs text-muted">{label}</span></div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <b className="text-lg">{monthLabel}</b>
        <div className="flex gap-2">
          <Button aria-label={t("st.mon.prev")} disabled={back >= MONTHS_BACK} onClick={() => { setBack(back + 1); setPicked(null); }} className="w-11 px-0"><ChevronLeft className="size-5 rtl:rotate-180" aria-hidden /></Button>
          <Button aria-label={t("st.mon.next")} disabled={back <= 0} onClick={() => { setBack(back - 1); setPicked(null); }} className="w-11 px-0"><ChevronRight className="size-5 rtl:rotate-180" aria-hidden /></Button>
        </div>
      </div>

      <Card className="grid grid-cols-4 gap-2 p-3">
        {tile(t("st.mon.present"), fill(t("st.mon.of"), { n: present, total: scheduled }))}
        {tile(t("st.mon.absent"), String(absent))}
        {tile(t("st.mon.late"), dur(lateMin))}
        {tile(t("st.mon.leave"), String(leaveDays))}
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-ground text-center text-xs font-semibold text-muted" aria-hidden>
          {cells.slice(0, 7).map((d) => <span key={d.getDay()} className="py-2">{d.toLocaleDateString(tag, { weekday: "narrow" })}</span>)}
        </div>
        <div role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-px bg-line">
          {cells.map((d) => {
            const k = ymd(d);
            const mine = inMonth(d);
            const isToday = k === todayKey, isSel = k === sel;
            const holiday = mine ? holidayName(k) : null;
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <button key={k} type="button" disabled={!mine} aria-pressed={isSel} onClick={() => setPicked(k)}
                aria-label={`${d.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}${holiday ? `, ${holiday}` : ""}`}
                style={holiday ? STRIPES : undefined}
                className={`flex min-h-14 flex-col items-center justify-start gap-0.5 bg-surface pt-1.5 ${mine ? "" : "opacity-40"} ${isSel ? "relative z-10 ring-2 ring-primary ring-inset" : ""}`}>
                <span className={`grid size-6 place-items-center rounded-full text-sm ${isToday ? "bg-primary font-bold text-white" : weekend ? "text-muted" : ""}`}>{d.getDate()}</span>
                {mine && (d <= today ? mark(k, true) : pill(k))}
              </button>
            );
          })}
        </div>
      </Card>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Check className="size-4 text-success" aria-hidden />{t("st.att.ontime")}</span>
        <span className="inline-flex items-center gap-1"><b className="text-warning">14m</b>{t("st.mon.late")}</span>
        <span className="inline-flex items-center gap-1"><b className="text-danger">A</b>{t("st.att.absent")}</span>
        <span className="inline-flex items-center gap-1"><i style={STRIPES} className="size-4 rounded-sm border border-line" />{t("st.att.holiday")}</span>
      </p>

      {selDate && (
        <Card className={`flex flex-col gap-2 p-4 ${flags.length ? "bg-warning-soft" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><b className="block">{selDate.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "short" })}</b>
              <span className="text-sm text-muted">{range}{worked > 0 ? ` · ${dur(worked)}` : ""}{res && res.overtime_min > 0 ? ` · ${fill(t("st.att.overtime"), { m: dur(res.overtime_min) })}` : ""}</span></div>
            <Badge tone={tone}>{text}</Badge>
          </div>
          {flags.length > 0 && <ul className="list-disc ps-5 text-sm">{flags.map((f) => <li key={f}>{FLAG_KEYS[f] ? t(FLAG_KEYS[f]) : f}</li>)}</ul>}
        </Card>
      )}

      <Amendments date={sel} />

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-muted">{fill(t("st.mon.holidays"), { month: first.toLocaleDateString(tag, { month: "long" }) })}</h2>
        {holidays.length === 0 ? <p className="px-1 text-muted">{t("st.mon.noHolidays")}</p> : (
          <Card className="divide-y divide-line">
            {holidays.map((h) => (
              <div key={h.day} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <b className="min-w-0 truncate">{holidayName(h.day)}</b>
                <span className="shrink-0 text-sm text-muted">{new Date(`${h.day}T00:00:00`).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
