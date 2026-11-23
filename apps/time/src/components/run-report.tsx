"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Printer, Download } from "lucide-react";
import { Badge, BottomSheet, Button, Input, Skeleton, downloadCsv, toCsv, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useTime } from "@/components/time-context";
import { languageOf } from "@/lib/languages";
import { money, pick } from "@/lib/format";
import { fill, type MessageKey } from "@/lib/messages";

type T = (k: MessageKey) => string;
interface Row { payslip_id: string; employee_id: string; name: string; name_local: string | null; branch_id: string | null; branch_name: string | null; branch_name_local: string | null; status: string; currency_code: string; gross: number; deductions: number; net: number; payment_method: string | null; bank_name: string | null; account_name: string | null; account_no: string | null }
interface Info { id: string; name: string; status: string; period_start: string; period_end: string; paid_at: string | null; drafts: number; reviews: number; exports: { kind: string; rows: number; at: string }[] }
export interface ReportRun { id: string; name: string; status: string }

const errKey = (e: { code?: string; message: string }): MessageKey =>
  e.message.includes("not ready") ? "tm.pr.err.notReady" : e.message.includes("reason") ? "tm.pr.err.reason" : e.message.includes("date") ? "tm.pr.err.date" : e.code === "P0001" ? "tm.pr.err.status" : "tm.pr.err.generic";

const sum = (rows: Row[], by: (r: Row) => string) => {
  const m = new Map<string, { key: string; cur: string; n: number; net: number }>();
  for (const r of rows) {
    const k = `${by(r)}|${r.currency_code}`;
    const x = m.get(k) ?? { key: by(r), cur: r.currency_code, n: 0, net: 0 };
    x.n += 1; x.net += Number(r.net); m.set(k, x);
  }
  return [...m.values()];
};

/** The payroll report of one run: what to pay, to whom, and how. Close, mark paid, lock and reopen live here too. */
export function RunReport({ t, locale, run, onClose, onChanged }: { t: T; locale: string; run: ReportRun | null; onClose: () => void; onChanged: () => void }) {
  const { canRuns, canExport } = useTime();
  const toast = useToast();
  const tag = languageOf(locale).dateTag;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [why, setWhy] = useState("");
  const [reopening, setReopening] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    const sb = createClient();
    const [r, i] = await Promise.all([sb.rpc("payroll_report", { p_run_id: id }), sb.rpc("payroll_run_info", { p_run_id: id })]);
    setRows((r.data ?? []) as Row[]); setInfo((i.data ?? null) as unknown as Info | null);
  }, []);
  useEffect(() => { if (run) { setRows(null); setInfo(null); setReopening(false); setWhy(""); void load(run.id); } }, [run, load]);

  const status = info?.status ?? run?.status ?? "open";
  const byMethod = useMemo(() => sum(rows ?? [], (r) => r.payment_method ?? "other"), [rows]);
  const byBranch = useMemo(() => sum(rows ?? [], (r) => (r.branch_id ? pick(locale, r.branch_name ?? "", r.branch_name_local) : "")), [rows, locale]);
  const totals = useMemo(() => sum(rows ?? [], () => ""), [rows]);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });

  async function act(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>, ok: MessageKey) {
    if (!run) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast("error", t(errKey(error))); return; }
    toast("success", t(ok)); setReopening(false); setWhy(""); await load(run.id); onChanged();
  }
  const sb = () => createClient();
  const log = (kind: "csv" | "print") => run && rows && sb().rpc("payroll_log_export", { p_run_id: run.id, p_kind: kind, p_rows: rows.length });

  function csv() {
    if (!rows || !run) return;
    downloadCsv(`payroll-${run.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`, toCsv(
      ["Name", "Branch", "Currency", "Gross", "Deductions", "Net", "Method", "Bank", "Account name", "Account no"],
      rows.map((r) => [r.name, r.branch_name ?? "", r.currency_code, r.gross, r.deductions, r.net, r.payment_method ?? "", r.bank_name ?? "", r.account_name ?? "", r.account_no ?? ""]),
    ));
    void log("csv"); void load(run.id);
  }
  function print() { void log("print"); window.print(); }

  return (
    <BottomSheet open={!!run} onClose={onClose} title={run ? `${t("tm.pr.report")} · ${run.name}` : ""} closeLabel={t("tm.day.close")}>
      {!rows || !info ? <Skeleton className="h-32 w-full rounded-card" /> : (
        <div className="print-area flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={status === "paid" || status === "locked" ? "success" : status === "closed" ? "info" : "neutral"}>{t(`tm.pr.st.${status}` as MessageKey)}</Badge>
            {info.paid_at && <span className="text-sm text-muted">{fill(t("tm.pr.rp.paidOn"), { date: fmtDate(info.paid_at) })}</span>}
          </div>
          {status === "open" && (info.drafts > 0 || info.reviews > 0) && <p className="text-sm text-muted">{fill(t("tm.pr.rp.notReady"), { d: info.drafts, r: info.reviews })}</p>}
          {rows.length === 0 ? <p className="text-sm text-muted">{t("tm.pr.rp.empty")}</p> : (
            <>
              <section className="flex flex-col gap-1">
                <b>{t("tm.pr.rp.totals")}</b>
                {totals.map((x) => <div key={x.cur} className="flex justify-between"><span>{x.cur} · {x.n}</span><b>{money(locale, x.net, x.cur)}</b></div>)}
              </section>
              <section className="flex flex-col gap-1">
                <b>{t("tm.pr.rp.method")}</b>
                {byMethod.map((x) => <div key={x.key + x.cur} className="flex justify-between text-sm"><span>{t(`tm.pr.m.${x.key}` as MessageKey)} · {x.n}</span><span>{money(locale, x.net, x.cur)}</span></div>)}
              </section>
              <section className="flex flex-col gap-1">
                <b>{t("tm.pr.rp.branch")}</b>
                {byBranch.map((x) => <div key={x.key + x.cur} className="flex justify-between text-sm"><span>{x.key || t("tm.pr.rp.noBranch")} · {x.n}</span><span>{money(locale, x.net, x.cur)}</span></div>)}
              </section>
              <section className="flex flex-col gap-1">
                <b>{t("tm.pr.rp.list")}</b>
                <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
                  {rows.map((r) => (
                    <li key={r.payslip_id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0">
                      <span className="flex flex-col"><b>{pick(locale, r.name, r.name_local)}</b>
                        <span className="text-sm text-muted">{t(`tm.pr.m.${r.payment_method ?? "other"}` as MessageKey)}{r.account_no ? ` · ${r.bank_name ? `${r.bank_name} ` : ""}${r.account_no}` : ""}</span></span>
                      <b>{money(locale, r.net, r.currency_code)}</b>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
          <div className="no-print flex flex-col gap-2">
            {canExport && rows.length > 0 && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={csv}><Download className="size-4" aria-hidden />{t("tm.pr.rp.csv")}</Button>
                <Button variant="secondary" onClick={print}><Printer className="size-4" aria-hidden />{t("tm.pr.rp.print")}</Button>
              </div>
            )}
            {canExport && info.exports.length > 0 && <p className="text-sm text-muted">{fill(t("tm.pr.rp.exports"), { n: info.exports.length })}</p>}
            {canRuns && status === "open" && <Button disabled={busy || info.drafts > 0 || rows.length === 0} onClick={() => act(() => sb().rpc("payroll_close", { p_run_id: run!.id }), "tm.pr.closed")}>{t("tm.pr.close")}</Button>}
            {canRuns && status === "closed" && (
              <>
                <Input label={t("tm.pr.rp.payDate")} type="date" value={payDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPayDate(e.target.value)} />
                <Button disabled={busy} onClick={() => act(() => sb().rpc("payroll_mark_paid", { p_run_id: run!.id, p_date: payDate }), "tm.pr.rp.paid")}>{t("tm.pr.rp.markPaid")}</Button>
                {!reopening ? <Button variant="quiet" onClick={() => setReopening(true)}>{t("tm.pr.reopen")}</Button> : (
                  <>
                    <Input label={t("tm.pr.reopen.reason")} value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} />
                    <Button variant="secondary" disabled={busy} onClick={() => act(() => sb().rpc("payroll_reopen", { p_run_id: run!.id, p_reason: why }), "tm.pr.reopened")}>{t("tm.pr.reopen")}</Button>
                  </>
                )}
              </>
            )}
            {canRuns && status === "paid" && (
              <>
                <p className="text-sm text-muted">{t("tm.pr.rp.lockHint")}</p>
                <Button variant="secondary" disabled={busy} onClick={() => act(() => sb().rpc("payroll_lock", { p_run_id: run!.id }), "tm.pr.rp.locked")}><Lock className="size-4" aria-hidden />{t("tm.pr.rp.lock")}</Button>
              </>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
