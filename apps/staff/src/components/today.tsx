"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LogIn, LogOut, Pencil, WifiOff } from "lucide-react";
import { Badge, Button, Card, CardBody, ProgressBar, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { store } from "@/lib/store";
import { hasOpenIn, hhmm, startOfDay, workedMinutes, ymd, type EventLite } from "@/lib/format";
import { LanguageBar } from "./language-bar";
import { ClockFlow } from "./clock-flow";
import { useDisplay, useMe } from "./me-context";
import { useClockOutbox } from "./outbox-context";

interface WorkDay { day_kind: string; start_time: string | null; end_time: string | null; break_min: number | null; hours: number; holiday_name: string | null; holiday_name_local: string | null }

export function Today() {
  const state = useMe();
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { time, duration, tag } = useFormat();
  const { name, branch } = useDisplay(state, locale);
  const outbox = useClockOutbox();

  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const [privacyOk, setPrivacyOk] = useState(true);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [work, setWork] = useState<WorkDay | null>(null);
  const [flow, setFlow] = useState<"in" | "out" | null>(null);

  useEffect(() => { setPrivacyOk(store.get("uplif.staff.privacy") === "1"); }, []);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    addEventListener("online", sync); addEventListener("offline", sync);
    return () => { removeEventListener("online", sync); removeEventListener("offline", sync); };
  }, []);

  const employeeId = state.employee_id;
  const load = useCallback(async () => {
    if (!employeeId) return;
    const supabase = createClient();
    const today = startOfDay(new Date());
    const [ev, wd] = await Promise.all([
      supabase.from("attendance_events").select("kind, occurred_at, flags").eq("employee_id", employeeId)
        .gte("occurred_at", today.toISOString()).order("occurred_at", { ascending: true }),
      supabase.rpc("employee_work_days", { p_employee_id: employeeId, p_from: ymd(today), p_days: 1 }),
    ]);
    if (!ev.error) setEvents(ev.data as EventLite[]);
    // Staff without permission to read schedules simply see no shift line.
    setWork(!wd.error && wd.data?.[0] ? (wd.data[0] as WorkDay) : null);
  }, [employeeId]);
  useEffect(() => { void load(); }, [load, state.last?.occurred_at]);

  // Clocks saved on the phone count as if sent, so the button and the day list stay right without signal.
  const waiting = outbox.items.filter((i) => i.status === "pending");
  const refused = outbox.items.filter((i) => i.status === "failed");
  const shown: (EventLite & { waiting?: boolean })[] = [
    ...events,
    ...waiting.filter((i) => i.data.day === ymd(new Date())).map((i) => ({ kind: i.data.kind, occurred_at: i.data.deviceTime, flags: [] as string[], waiting: true })),
  ];
  const clockedIn = waiting.length > 0 ? waiting[waiting.length - 1].data.kind === "in" : state.last?.kind === "in" || hasOpenIn(events);

  const holiday = work ? ((locale !== "en" && work.holiday_name_local) || work.holiday_name) : null;
  const hasShift = !!work?.start_time && !!work?.end_time;
  const shiftLine = !work ? null
    : holiday ? fill(t("st.shift.holiday"), { name: holiday })
    : hasShift ? fill(t("st.shift"), { start: hhmm(work.start_time), end: hhmm(work.end_time) })
    : work.day_kind === "none" ? t("st.shift.none") : t("st.shift.off");

  const worked = now ? workedMinutes(shown, now, true) : 0;
  const totalMin = work ? Math.round(Number(work.hours) * 60) : 0;
  const pct = totalMin > 0 ? Math.min(100, Math.round((worked / totalMin) * 100)) : 0;
  const first = shown[0], lastEvent = shown[shown.length - 1];

  const statusBadge = clockedIn && state.last
    ? <Badge tone="success">{fill(t("st.status.in"), { time: time((events.find((e) => e.kind === "in") ?? state.last).occurred_at) }).replace(/[.។]$/, "")}</Badge>
    : <Badge>{t("st.status.out").replace(/[.។]$/, "")}</Badge>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold">
          <span className="truncate">{branch ?? t("st.noBranch")}</span>
        </span>
        <LanguageBar />
      </header>

      <div>
        <h1 className="truncate text-2xl font-bold tracking-tight">{fill(t("st.hello"), { name })}</h1>
        <p className="text-muted" suppressHydrationWarning>{now ? now.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" }) : " "}</p>
      </div>

      {!privacyOk && (
        <Card><CardBody className="flex flex-col gap-3">
          <b>{t("st.privacy.title")}</b>
          <p className="text-muted">{t("st.privacy.body")}</p>
          <Button variant="primary" onClick={() => { store.set("uplif.staff.privacy", "1"); setPrivacyOk(true); }}>{t("st.privacy.ok")}</Button>
        </CardBody></Card>
      )}

      {!online && (
        <p role="status" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 text-warning-ink"><WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />{t("st.offline.ok")}</p>
      )}
      {waiting.length > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-warning-soft p-3 text-warning-ink">
          <span>{fill(t("st.out.banner"), { n: waiting.length })}</span>
          {online && <Button loading={outbox.sending} onClick={() => void outbox.flush()}>{t("st.out.send")}</Button>}
        </div>
      )}
      {refused.map((i) => (
        <div key={i.id} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-danger-soft p-3 text-danger-ink">
          <span>{t("st.out.failed")}</span>
          <Button onClick={() => void outbox.dismiss(i.id)}>{t("st.out.dismiss")}</Button>
        </div>
      ))}

      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">{statusBadge}{shiftLine && <span className="text-sm text-muted">{shiftLine}</span>}</div>
          <div className="text-5xl font-bold tabular-nums tracking-tight" aria-label={clockedIn ? undefined : t("st.now")} suppressHydrationWarning>
            {clockedIn ? duration(worked) : now ? time(now) : "--:--"}
          </div>
          {clockedIn && totalMin > 0 && (
            <div className="flex flex-col gap-2">
              <ProgressBar value={pct} label={fill(t("st.worked.of"), { worked: duration(worked), total: duration(totalMin) })} />
              <span className="text-sm text-muted">{fill(t("st.worked.of"), { worked: duration(worked), total: duration(totalMin) })}</span>
            </div>
          )}
          <Button variant={clockedIn ? "secondary" : "primary"} disabled={!privacyOk}
            className={`h-16 w-full text-lg ${clockedIn ? "border-primary! text-link!" : ""}`} onClick={() => setFlow(clockedIn ? "out" : "in")}>
            {clockedIn ? <LogOut className="size-6" aria-hidden /> : <LogIn className="size-6" aria-hidden />}
            {t(clockedIn ? "st.clockOut" : "st.clockIn")}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <div className="px-4 pb-1 pt-4"><span className="caps text-xs font-bold text-muted">{t("st.today")}</span></div>
        <ul className="divide-y divide-line">
          {shown.map((e, i) => (
            <li key={`${e.occurred_at}-${i}`} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-control ${e.kind === "in" ? "bg-success-soft text-success-ink" : "bg-neutral-soft text-muted"}`}>
                {e.kind === "in" ? <LogIn className="size-4" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1"><b className="block">{t(e.kind === "in" ? "st.kind.in" : "st.kind.out")}</b><span className="text-sm text-muted">{time(e.occurred_at)}</span></div>
              {e.waiting ? <Badge tone="warning">{t("st.out.waiting")}</Badge> : e.flags.length > 0 && <Badge tone="warning">{t("st.review")}</Badge>}
            </li>
          ))}
          {!first && hasShift && (
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-neutral-soft text-muted"><LogIn className="size-4" aria-hidden /></span>
              <div><b className="block">{t("st.kind.in")}</b><span className="text-sm text-muted">{fill(t("st.sched"), { time: hhmm(work!.start_time) })}</span></div>
            </li>
          )}
          {(!lastEvent || lastEvent.kind === "in") && hasShift && (
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-neutral-soft text-muted"><LogOut className="size-4" aria-hidden /></span>
              <div><b className="block">{t("st.kind.out")}</b><span className="text-sm text-muted">{fill(t("st.sched"), { time: hhmm(work!.end_time) })}</span></div>
            </li>
          )}
          {shown.length === 0 && !hasShift && <li className="px-4 py-3 text-muted">{t("st.recent.empty")}</li>}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3" aria-label="">
        {[{ icon: CalendarDays, label: t("st.q.leave") }, { icon: Pencil, label: t("st.q.fix") }].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 opacity-80">
            <div className="flex items-center justify-between"><Icon className="size-5 text-link" aria-hidden /><Badge>{t("st.soon")}</Badge></div>
            <b className="text-sm">{label}</b>
          </div>
        ))}
      </div>

      {flow && (
        <ClockFlow kind={flow} onClose={() => setFlow(null)} onSaved={() => {
          toast("success", fill(t(flow === "in" ? "st.done.in" : "st.done.out"), { time: time(new Date()) }));
          void load();
          router.refresh();
        }} />
      )}
    </div>
  );
}
