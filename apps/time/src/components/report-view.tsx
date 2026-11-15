"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton, Tabs, downloadCsv, toCsv, cn } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { languageOf } from "@/lib/languages";
import { pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

interface Row {
  employee_id: string; name: string; name_local: string | null; position_name: string | null; position_name_local: string | null;
  days: string[]; work_days: number; on_time: number; late: number; early_leave: number; absent: number; leave_days: number;
  incomplete: number; late_min: number; overtime_min: number; worked_min: number; flagged_days: number;
}
type Mode = "week" | "month";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** First day and length of the period that holds `anchor`: Monday to Sunday, or the calendar month. */
function period(anchor: Date, mode: Mode): { from: Date; days: number } {
  if (mode === "week") return { from: addDays(anchor, -((anchor.getDay() + 6) % 7)), days: 7 };
  return { from: new Date(anchor.getFullYear(), anchor.getMonth(), 1), days: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() };
}

const cellTone: Record<string, string> = {
  on_time: "bg-success-soft text-success-ink", in_progress: "bg-primary-soft text-primary-ink", late: "bg-warning-soft text-warning-ink",
  early_leave: "bg-warning-soft text-warning-ink", incomplete: "bg-warning-soft text-warning-ink", absent: "bg-danger-soft text-danger-ink",
  leave: "bg-primary-soft text-primary-ink", extra: "bg-primary-soft text-primary-ink",
};
const cellMark: Record<string, string> = {
  on_time: "✓", in_progress: "•", late: "L", early_leave: "E", incomplete: "?", absent: "A", leave: "V", extra: "+", holiday: "H", off: "", none: "", future: "", pending: "", not_employed: "",
};

/** Attendance report: one row per person, one cell per day, with totals. Week or month; CSV for payroll and records. */
export function ReportView() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { from, days } = useMemo(() => period(anchor, mode), [anchor, mode]);
  const fromIso = iso(from);

  const load = useCallback(async () => {
    setRows(null); setFailed(false);
    const { data, error } = await createClient().rpc("time_attendance_report", { p_from: fromIso, p_days: days });
    if (error) { setFailed(true); return; }
    setRows(data ?? []);
  }, [fromIso, days]);
  useEffect(() => { load(); }, [load]);

  const tag = languageOf(locale).dateTag;
  const title = mode === "month"
    ? new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(from)
    : `${new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(from)} – ${new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(addDays(from, days - 1))}`;
  const step = (dir: -1 | 1) => setAnchor(mode === "week" ? addDays(anchor, 7 * dir) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  const st = (s: string) => t((`tm.st.${s}`) as MessageKey);
  const dayNum = (i: number) => addDays(from, i).getDate();
  const isOff = (s: string) => s === "off" || s === "holiday";

  function exportCsv() {
    const header = [t("tm.rep.person"), ...Array.from({ length: days }, (_, i) => iso(addDays(from, i))),
      t("tm.rep.col.workDays"), t("tm.rep.col.onTime"), t("tm.rep.col.late"), t("tm.rep.col.lateMin"), t("tm.rep.col.early"), t("tm.rep.col.absent"),
      t("tm.rep.col.leave"), t("tm.rep.col.incomplete"), t("tm.rep.col.overtime"), t("tm.rep.col.worked")];
    const body = (rows ?? []).map((r) => [pick(locale, r.name, r.name_local), ...r.days.map(st), r.work_days, r.on_time, r.late, r.late_min,
      r.early_leave, r.absent, r.leave_days, r.incomplete, r.overtime_min, r.worked_min]);
    downloadCsv(`attendance-${fromIso}-${days}d.csv`, toCsv(header, body));
  }

  const totals = (rows ?? []).reduce((a, r) => ({ late: a.late + r.late, absent: a.absent + r.absent, leave: a.leave + r.leave_days, ot: a.ot + r.overtime_min }),
    { late: 0, absent: 0, leave: 0, ot: 0 });

  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("tm.attendance.title")}</h1>
        <Button onClick={exportCsv} disabled={!rows?.length}><Download className="size-4" aria-hidden />{t("tm.rep.export")}</Button>
      </div>
      <Tabs label={t("tm.rep.period")} value={mode} onChange={(m) => setMode(m as Mode)} items={[{ id: "week", label: t("tm.rep.week") }, { id: "month", label: t("tm.rep.month") }]} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label={t("tm.rep.prev")} className="grid size-11 place-items-center rounded-full border border-line bg-surface"><ChevronLeft className="size-5 rtl:rotate-180" aria-hidden /></button>
        <b className="text-lg">{title}</b>
        <button type="button" onClick={() => step(1)} aria-label={t("tm.rep.next")} className="grid size-11 place-items-center rounded-full border border-line bg-surface"><ChevronRight className="size-5 rtl:rotate-180" aria-hidden /></button>
      </div>
      {failed ? (
        <ErrorState title={t("tm.rep.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />
      ) : rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("tm.rep.empty")} />
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {([["late", totals.late], ["absent", totals.absent], ["leave", totals.leave], ["overtime", totals.ot]] as const).map(([k, v]) => (
              <div key={k} className="rounded-card border border-line bg-surface px-1 py-2"><dd className="text-xl font-bold">{v}</dd><dt className="text-xs text-muted">{t((`tm.rep.col.${k}`) as MessageKey)}</dt></div>
            ))}
          </dl>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="sticky start-0 z-10 min-w-36 bg-surface px-3 py-2 text-start">{t("tm.rep.person")}</th>
                  {Array.from({ length: days }, (_, i) => <th key={i} scope="col" className="min-w-8 px-0.5 py-2 font-medium">{dayNum(i)}</th>)}
                  <th scope="col" className="px-2 py-2">{t("tm.rep.col.late")}</th>
                  <th scope="col" className="px-2 py-2">{t("tm.rep.col.absent")}</th>
                  <th scope="col" className="px-2 py-2">{t("tm.rep.col.leave")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee_id} className="border-t border-line">
                    <th scope="row" className="sticky start-0 z-10 max-w-44 truncate bg-surface px-3 py-2 text-start font-semibold">{pick(locale, r.name, r.name_local)}</th>
                    {r.days.map((s, i) => (
                      <td key={i} className="px-0.5 py-1 text-center">
                        <span title={st(s)} aria-label={st(s)} className={cn("grid h-7 min-w-7 place-items-center rounded-md text-xs font-bold", cellTone[s] ?? (isOff(s) ? "bg-neutral-soft text-muted" : "text-muted"))}>{cellMark[s] ?? ""}</span>
                      </td>
                    ))}
                    <td className="px-2 text-center">{r.late}</td>
                    <td className="px-2 text-center">{r.absent}</td>
                    <td className="px-2 text-center">{r.leave_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
