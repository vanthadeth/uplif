"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, CircleCheck, Clock, RefreshCw, UserX } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, ErrorState, Skeleton, StatTile, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { languageOf } from "@/lib/languages";
import { pick } from "@/lib/format";
import Link from "next/link";
import { useTime } from "@/components/time-context";

interface Rev { id: string; name: string; name_local: string | null; run_name: string; message: string }

interface Row {
  employee_id: string; name: string; name_local: string | null; position_name: string | null; position_name_local: string | null;
  status: string; first_in: string | null; late_min: number; overtime_min: number; flagged: boolean;
}
type Filter = "all" | "in" | "late" | "notIn" | "leave";

const PRESENT = ["in_progress", "on_time", "late", "early_leave", "incomplete", "extra"];
const NOT_IN = ["pending", "absent"];
const SHOWN = [...PRESENT, ...NOT_IN, "leave"];
const tone: Record<string, BadgeTone> = {
  on_time: "success", in_progress: "info", late: "warning", early_leave: "warning", incomplete: "warning", pending: "danger", absent: "danger", leave: "info", extra: "info",
};
const group = (s: string): Filter | null => (PRESENT.includes(s) ? "in" : NOT_IN.includes(s) ? "notIn" : s === "leave" ? "leave" : null);
const order = (s: string) => (s === "late" ? 0 : NOT_IN.includes(s) ? 1 : PRESENT.includes(s) ? 2 : 3);

/** Today board: who is in, late, not in yet or on leave, for everyone the signed-in role may look after. Refreshes every minute. */
export function TodayView() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const { canSlips } = useTime();
  const [revs, setRevs] = useState<Rev[]>([]);
  useEffect(() => { if (canSlips) createClient().rpc("payroll_reviews", { p_only_open: true }).then(({ data }) => setRevs((data ?? []) as Rev[])); }, [canSlips]);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("time_today");
    if (error) { setFailed(true); return; }
    setFailed(false);
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const shown = (rows ?? []).filter((r) => SHOWN.includes(r.status));
  const count = (f: Filter) => shown.filter((r) => (f === "late" ? r.status === "late" : group(r.status) === f)).length;
  const list = shown
    .filter((r) => filter === "all" || (filter === "late" ? r.status === "late" : group(r.status) === filter))
    .sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name));
  const toggle = (f: Filter) => setFilter(filter === f ? "all" : f);
  const loading = rows === null && !failed;
  const today = new Intl.DateTimeFormat(languageOf(locale).dateTag, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const time = (iso: string) => new Intl.DateTimeFormat(languageOf(locale).dateTag, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  const label = (r: Row) => r.status === "late" ? fill(t("tm.st.late"), { min: r.late_min }) : t((`tm.st.${r.status}`) as MessageKey);
  const sub = (r: Row) => [r.first_in ? fill(t("tm.today.in_at"), { time: time(r.first_in) }) : NOT_IN.includes(r.status) ? t("tm.today.noClockIn") : null,
    pick(locale, r.position_name ?? "", r.position_name_local)].filter(Boolean).join(" · ");

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("tm.today.title")}</h1>
        <p className="mt-1 text-muted">{today}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile loading={loading} tone="success" icon={<CircleCheck className="size-5" />} value={count("in")} label={t("tm.today.in")} hint={fill(t("tm.today.inHint"), { n: shown.length })} pressed={filter === "in"} onClick={() => toggle("in")} />
        <StatTile loading={loading} tone="warning" icon={<Clock className="size-5" />} value={count("late")} label={t("tm.today.late")} hint={t("tm.today.lateHint")} pressed={filter === "late"} onClick={() => toggle("late")} />
        <StatTile loading={loading} tone="danger" icon={<UserX className="size-5" />} value={count("notIn")} label={t("tm.today.notIn")} hint={t("tm.today.notInHint")} pressed={filter === "notIn"} onClick={() => toggle("notIn")} />
        <StatTile loading={loading} tone="info" icon={<CalendarOff className="size-5" />} value={count("leave")} label={t("tm.today.leave")} hint={t("tm.today.leaveHint")} pressed={filter === "leave"} onClick={() => toggle("leave")} />
      </div>
      {revs.length > 0 && (
        <Link href="/payroll" className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
          <span className="flex items-center justify-between"><b>{t("tm.today.reviews")}</b><Badge tone="warning">{revs.length}</Badge></span>
          {revs.slice(0, 3).map((r) => <span key={r.id} className="truncate text-sm text-muted">{pick(locale, r.name, r.name_local)} · {r.run_name}: {r.message}</span>)}
          <span className="text-sm font-semibold text-primary">{t("tm.today.reviewsOpen")}</span>
        </Link>
      )}
      <h2 className="caps text-xs font-bold text-muted">{t("tm.today.people")}</h2>
      {failed ? (
        <ErrorState title={t("tm.today.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title={t("tm.today.empty")} />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {list.map((r) => (
            <li key={r.employee_id} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <Avatar name={pick(locale, r.name, r.name_local)} size="lg" />
              <span className="flex min-w-0 flex-1 flex-col"><b className="truncate">{pick(locale, r.name, r.name_local)}</b><span className="truncate text-sm text-muted">{sub(r)}</span></span>
              <Badge tone={tone[r.status] ?? "neutral"}>{label(r)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
