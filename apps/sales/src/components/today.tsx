"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, LogIn, LogOut, MapPin, MessageSquare, UserPlus } from "lucide-react";
import { Badge, Button, Card, CardBody, ClockFlow, Reveal, Skeleton, type ClockSupabase } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { languageOf } from "@/lib/languages";
import { goCache } from "@/lib/offline";
import { shownName, type InboxRow } from "@/lib/customers";
import { daysFrom, ymd, type PlanStop, type TaskRow } from "@/lib/plan";
import type { MessageKey } from "@/lib/messages";
import { useMe } from "./me-context";
import { useGoOutbox } from "./outbox-context";
import { LanguageBar } from "./language-bar";
import { deviceId } from "@/lib/store";

interface Clock { kind: "in" | "out" | null; at: string | null; minutes: number }
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Minutes worked today from clock events: each "in" runs until the next "out", or until now. */
function worked(events: { kind: string; occurred_at: string }[], now: number): number {
  let total = 0, open: number | null = null;
  for (const e of events) {
    const at = new Date(e.occurred_at).getTime();
    if (e.kind === "in" && open === null) open = at;
    if (e.kind === "out" && open !== null) { total += at - open; open = null; }
  }
  if (open !== null) total += now - open;
  return Math.max(0, Math.round(total / 60000));
}

/** Today: greeting, clock card and what needs attention. Visits, orders and the plan arrive with the next slices. */
export default function Today() {
  const { t, locale } = useI18n();
  const me = useMe();
  const ob = useGoOutbox();
  const tag = languageOf(locale).dateTag;
  const [clock, setClock] = useState<Clock | null>(null);
  const [attention, setAttention] = useState<InboxRow[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [flow, setFlow] = useState<"in" | "out" | null>(null);
  const [plan, setPlan] = useState<PlanStop[] | null>(null);
  const [late, setLate] = useState<TaskRow[]>([]);
  const [visit, setVisit] = useState<{ id: string; customer_id: string | null; checked_in_at: string; name: string | null; name_local: string | null } | null | undefined>(undefined);

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    let live = true;
    const owner = me.employee_id ?? "";
    const supabase = createClient();
    void goCache.get<InboxRow[]>(owner, "today").then((c) => { if (live && c) setAttention((p) => p ?? c.value); });
    supabase.rpc("sales_inbox", { p_limit: 30 }).then(({ data, error }) => {
      if (!live || error) return;
      const rows = ((data ?? []) as unknown as InboxRow[]).filter((r) => r.unread).slice(0, 3);
      setAttention(rows); void goCache.set(owner, "today", rows);
    });
    void goCache.get<PlanStop[]>(owner, `plan:${ymd()}`).then((c) => { if (live && c) setPlan((p) => p ?? c.value); });
    supabase.rpc("sales_plan_day", { p_day: ymd() }).then(({ data, error }) => {
      if (!live || error) return;
      const list = (data ?? []) as unknown as PlanStop[];
      setPlan(list); void goCache.set(owner, `plan:${ymd()}`, list);
    });
    supabase.rpc("sales_task_list").then(({ data, error }) => {
      if (!live || error) return;
      setLate(((data ?? []) as unknown as TaskRow[]).filter((r) => !r.done_at && daysFrom(r.due_date) < 0).slice(0, 2));
    });
    supabase.rpc("sales_open_visit").then(({ data, error }) => { if (live && !error) setVisit((data as unknown as typeof visit) ?? null); });
    supabase.from("attendance_events").select("kind, occurred_at").eq("employee_id", owner)
      .gte("occurred_at", startOfDay().toISOString()).order("occurred_at", { ascending: true }).then(({ data, error }) => {
        if (!live || error) return;
        const ev = data ?? [];
        const last = ev[ev.length - 1];
        setClock({ kind: (last?.kind as "in" | "out") ?? null, at: last?.occurred_at ?? null, minutes: worked(ev, Date.now()) });
      });
    return () => { live = false; };
  }, [me.employee_id, tick]);

  const name = (locale !== "en" && me.employee_name_local) || me.employee_name || "";
  // A check-in still waiting on the phone counts as an open visit until the server has it.
  const waitingIn = ob.items.find((i) => i.data.kind === "checkin" && i.status === "pending");
  const shownVisit = visit ?? (waitingIn && waitingIn.data.kind === "checkin"
    ? { id: waitingIn.data.opId, customer_id: waitingIn.data.customerId || null, checked_in_at: waitingIn.data.at, name: waitingIn.data.name || null, name_local: null } : null);
  // A clock tapped without signal counts until the server has it.
  const waitingClock = [...ob.items].reverse().find((i) => i.data.kind === "clock" && i.status === "pending");
  const clockKind = waitingClock && waitingClock.data.kind === "clock" ? waitingClock.data.job.kind : clock?.kind ?? null;
  const clockedIn = clockKind === "in" || !!shownVisit;
  const mins = clock && clockedIn && now ? worked([{ kind: "in", occurred_at: new Date(now.getTime() - clock.minutes * 60000).toISOString() }], now.getTime()) : clock?.minutes ?? 0;
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dur = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"><span className="truncate">{me.company_name}</span></span>
        <LanguageBar />
      </header>
      <div>
        <h1 className="truncate text-2xl font-bold tracking-tight">{fill(t("go.today.hello"), { name })}</h1>
        <p className="text-muted" suppressHydrationWarning>{now ? now.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" }) : " "}</p>
      </div>

      <section aria-label={t("go.today.clock")} className="flex flex-col gap-3 rounded-2xl bg-navy p-4 text-white shadow-pop">
        {clock === null ? <Skeleton className="h-24 w-full bg-white/10" /> : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${clockedIn ? "bg-[#1b5e3d] text-[#d7f2e2]" : "bg-[#2a3550] text-[#d6e0f2]"}`}>
                {clock.at ? fill(t(clockedIn ? "go.today.in" : "go.today.out"), { time: hhmm(clock.at) }) : t("go.today.notYet")}
              </span>
            </div>
            <div>
              <div className="text-xs text-[#aebbd0]">{t("go.today.worked")}</div>
              <div className="text-4xl font-bold tabular-nums tracking-tight" suppressHydrationWarning>{dur}</div>
            </div>
            {clockKind !== "in" && (
              <button type="button" onClick={() => setFlow("in")} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-control bg-primary text-lg font-semibold text-white active:scale-[.99]">
                <LogIn className="size-6" aria-hidden />{t("go.today.clockIn")}
              </button>
            )}
            {shownVisit ? (
              <Link href="/visit" className="flex min-h-14 items-center justify-center gap-2 rounded-control bg-primary text-lg font-semibold text-white active:scale-[.99]">
                <MapPin className="size-6" aria-hidden />{fill(t("go.today.atVisit"), { name: shownVisit.name ? shownName({ name: shownVisit.name, name_local: shownVisit.name_local }, locale) : t("go.checkin.none") })}
              </Link>
            ) : (
              <Link href="/check-in" className={clockKind === "in" ? "flex min-h-14 items-center justify-center gap-2 rounded-control bg-primary text-lg font-semibold text-white active:scale-[.99]" : "flex min-h-12 items-center justify-center gap-2 rounded-control border border-white/30 font-semibold"}>
                <MapPin className="size-6" aria-hidden />{t("go.today.checkIn")}
              </Link>
            )}
            {clockKind === "in" && (
              <button type="button" onClick={() => setFlow("out")} className="flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-[#aebbd0]">
                <LogOut className="size-4" aria-hidden />{t("go.today.clockOut")}
              </button>
            )}
          </>
        )}
      </section>

      <Card>
        <CardBody className="flex flex-col gap-0 p-4">
          <div className="flex items-center gap-2 pb-2"><b className="flex-1">{t("go.today.attention")}</b>{attention && attention.length + late.length > 0 && <Badge tone="danger">{attention.length + late.length}</Badge>}</div>
          {attention === null ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
          ) : attention.length + late.length === 0 ? (
            <p className="m-0 border-t border-line pt-3 text-muted">{t("go.today.attention.none")}</p>
          ) : [...late.map((r) => (
            <Link key={r.id} href="/tasks" className="flex items-center gap-3 border-t border-line py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-danger-soft text-danger-ink"><Clock className="size-[18px]" aria-hidden /></span>
              <span className="min-w-0 flex-1"><b className="block truncate">{fill(t("go.today.overdue"), { title: r.title })}</b><span className="block truncate text-xs text-muted">{fill(t("go.tasks.late"), { n: -daysFrom(r.due_date) })}</span></span>
              <span className="text-sm font-semibold text-link">{t("go.today.open")}</span>
            </Link>)),
            ...attention.map((r, i) => (
            <Reveal key={r.customer_id} delay={i * 30}>
              <Link href={`/customers/${r.customer_id}`} className="flex items-center gap-3 border-t border-line py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><MessageSquare className="size-[18px]" aria-hidden /></span>
                <span className="min-w-0 flex-1"><b className="block truncate">{fill(t("go.today.replied"), { name: shownName(r, locale) })}</b><span className="block truncate text-xs text-muted">{r.body || t("go.inbox.photo")}</span></span>
                <span className="text-sm font-semibold text-link">{t("go.today.open")}</span>
              </Link>
            </Reveal>
          ))]}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3 p-4">
          <div className="flex items-center"><b className="flex-1">{t("go.plan.title")}</b>{plan && <span className="me-3 text-sm text-muted">{fill(t("go.plan.stops"), { n: plan.length })}</span>}<Link href="/plan/add" className="text-sm font-semibold text-link">{t("go.plan.add")}</Link></div>
          {plan === null ? <Skeleton className="h-16 w-full" /> : plan.length === 0 ? <p className="m-0 text-muted">{t("go.plan.empty")}</p> : (
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {plan.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span className="flex flex-col items-center pt-1"><span className={`size-3.5 shrink-0 rounded-full border-2 ${s.visited ? "border-success bg-success" : "border-muted bg-surface"}`} />{i < plan.length - 1 && <span className="mt-0.5 w-0.5 flex-1 bg-line" />}</span>
                  <Link href={`/customers/${s.customer_id}`} className="min-w-0 flex-1 pb-3.5">
                    <span className="flex items-center gap-2"><span className="w-10 shrink-0 text-xs text-muted">{s.planned_time ? s.planned_time.slice(0, 5) : ""}</span>
                      <b className={`flex-1 truncate ${s.visited ? "text-muted" : ""}`}>{shownName(s, locale)}</b>
                      <Badge tone={s.kind === "appointment" ? "info" : s.kind === "delivery" ? "success" : s.kind === "collection" ? "warning" : "neutral"}>{t(`go.plan.kind.${s.kind}` as MessageKey)}</Badge></span>
                    <span className="ms-12 block truncate text-xs text-muted">{s.visited ? t("go.plan.visited") : s.note ?? (s.last_visit_at ? fill(t("go.plan.lastVisit"), { n: Math.max(0, -daysFrom(s.last_visit_at.slice(0, 10))) }) : s.address ?? "")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {me.can_create && (
        <Link href="/customers/new"><Button className="w-full"><UserPlus className="size-4" aria-hidden />{t("go.today.newCustomer")}</Button></Link>
      )}
      {flow && (
        <ClockFlow
          kind={flow} onClose={() => { setFlow(null); setTick((n) => n + 1); }} onSaved={() => setTick((n) => n + 1)}
          t={t} supabase={createClient() as unknown as ClockSupabase}
          companyId={me.company_id ?? ""} employeeId={me.employee_id ?? ""} deviceId={deviceId()}
          formatTime={(v) => new Date(v).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
          saveOffline={(job) => ob.save({ kind: "clock", opId: job.eventId, job })}
          hasPending={ob.items.some((i) => i.status === "pending")}
        />
      )}
    </div>
  );
}
