"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { Avatar, Badge, BottomSheet, Button, EmptyState, ErrorState, Input, Skeleton, Tabs, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTime } from "@/components/time-context";
import { languageOf } from "@/lib/languages";
import { pick } from "@/lib/format";
import { fill, type MessageKey } from "@/lib/messages";

interface Req {
  id: string; employee_id: string; employee_name: string; employee_name_local: string | null; type_code: string; type_name: string; type_name_local: string | null;
  start_date: string; end_date: string; half: string; days: number; reason: string | null; status: string; decision_note: string | null;
}
interface Bal {
  employee_id: string; name: string; name_local: string | null; type_id: string; type_code: string; type_name: string; type_name_local: string | null;
  entitled: number; allowance: number; used: number; pending: number;
}
type Status = "pending" | "approved" | "rejected";

/** Leave: the queue of requests to approve or reject, and each person's balance, where Owner and Admin can give or take days. */
export function LeaveView() {
  const { t, locale } = useI18n();
  const { canGiveLeave } = useTime();
  const [tab, setTab] = useState<"requests" | "balances">("requests");
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("tm.leave.title")}</h1>
      <Tabs label={t("tm.leave.title")} value={tab} onChange={(v) => setTab(v as "requests" | "balances")} items={[{ id: "requests", label: t("tm.lv.requests") }, { id: "balances", label: t("tm.lv.balances") }]} />
      {tab === "requests" ? <Requests t={t} locale={locale} /> : <Balances t={t} locale={locale} canGive={canGiveLeave} />}
    </main>
  );
}

type T = (k: MessageKey) => string;

function Requests({ t, locale }: { t: T; locale: string }) {
  const toast = useToast();
  const tag = languageOf(locale).dateTag;
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<Req[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setFailed(false);
    const { data, error } = await createClient().rpc("leave_review_list", { p_status: status });
    if (error) { setFailed(true); return; }
    setRows((data ?? []) as Req[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function decide(r: Req, approve: boolean, n: string | null) {
    setBusy(r.id);
    const { error } = await createClient().rpc("decide_leave", { p_id: r.id, p_approve: approve, p_note: n });
    setBusy(null);
    if (error) {
      const msg = error.message.includes("balance") ? "tm.lv.err.balance" : error.message.includes("already decided") ? "tm.lv.err.decided" : "tm.lv.err.generic";
      toast("error", t(msg));
      if (msg === "tm.lv.err.decided") load();
      return;
    }
    toast("success", t("tm.lv.decided"));
    setRejecting(null); setNote("");
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
  }

  const fmt = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(new Date(d + "T00:00:00"));
  const range = (r: Req) => (r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)} – ${fmt(r.end_date)}`) + (r.half !== "full" ? ` · ${t(r.half === "start" ? "tm.lv.half.start" : "tm.lv.half.end")}` : "");

  return (
    <>
      <Tabs label={t("tm.lv.status")} value={status} onChange={(v) => setStatus(v as Status)} items={(["pending", "approved", "rejected"] as const).map((s) => ({ id: s, label: t(`tm.lv.${s}` as MessageKey) }))} />
      {failed ? (
        <ErrorState title={t("tm.lv.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />
      ) : rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("tm.lv.empty")} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Avatar name={pick(locale, r.employee_name, r.employee_name_local)} size="lg" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate">{pick(locale, r.employee_name, r.employee_name_local)}</b>
                  <span className="text-sm text-muted">{range(r)}</span>
                </span>
                <Badge tone="info">{pick(locale, r.type_name, r.type_name_local)} · {fill(t("tm.lv.days"), { n: r.days })}</Badge>
              </div>
              {r.reason && <p className="text-sm">{r.reason}</p>}
              {r.decision_note && <p className="text-sm text-muted">{r.decision_note}</p>}
              {status === "pending" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={busy === r.id} onClick={() => { setNote(""); setRejecting(r); }}><X className="size-4" aria-hidden />{t("tm.lv.reject")}</Button>
                  <Button disabled={busy === r.id} onClick={() => decide(r, true, null)}><Check className="size-4" aria-hidden />{t("tm.lv.approve")}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={!!rejecting} onClose={() => setRejecting(null)} title={t("tm.lv.confirmReject")} closeLabel={t("tm.day.close")}
        footer={rejecting && <Button variant="danger" disabled={busy === rejecting.id} onClick={() => decide(rejecting, false, note)}>{t("tm.lv.reject")}</Button>}>
        <Textarea label={t("tm.lv.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </BottomSheet>
    </>
  );
}

function Balances({ t, locale, canGive }: { t: T; locale: string; canGive: boolean }) {
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Bal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [giving, setGiving] = useState<Bal | null>(null);
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setRows(null); setFailed(false);
    const { data, error } = await createClient().rpc("time_leave_balances", { p_year: year });
    if (error) { setFailed(true); return; }
    setRows((data ?? []) as Bal[]);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    const m = new Map<string, { id: string; name: string; local: string | null; items: Bal[] }>();
    for (const r of rows ?? []) {
      const p = m.get(r.employee_id) ?? { id: r.employee_id, name: r.name, local: r.name_local, items: [] };
      p.items.push(r); m.set(r.employee_id, p);
    }
    return [...m.values()];
  }, [rows]);

  async function save() {
    if (!giving) return;
    const n = Number(days);
    if (!Number.isFinite(n) || n === 0 || !reason.trim()) { toast("error", t("tm.lv.err.allowance")); return; }
    setSaving(true);
    const { error } = await createClient().rpc("grant_leave_allowance", { p_employee_id: giving.employee_id, p_type_id: giving.type_id, p_year: year, p_days: n, p_reason: reason.trim() });
    setSaving(false);
    if (error) { toast("error", t(error.code === "P0001" ? "tm.lv.err.allowance" : "tm.lv.err.generic")); return; }
    toast("success", t("tm.lv.decided"));
    setGiving(null); setDays(""); setReason("");
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <b>{t("tm.lv.year")}</b>
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label={String(year - 1)} onClick={() => setYear(year - 1)}>‹</Button>
          <b className="min-w-12 text-center">{year}</b>
          <Button variant="secondary" aria-label={String(year + 1)} onClick={() => setYear(year + 1)}>›</Button>
        </div>
      </div>
      {failed ? (
        <ErrorState title={t("tm.lv.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />
      ) : rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>
      ) : people.length === 0 ? (
        <EmptyState title={t("tm.lv.noBalances")} />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
              <b>{pick(locale, p.name, p.local)}</b>
              {p.items.map((b) => {
                const left = b.entitled - b.used - b.pending;
                return (
                  <div key={b.type_id} className="flex items-center justify-between gap-2 text-sm">
                    <span><b>{b.type_code}</b> · {fill(t("tm.lv.left"), { left, total: b.entitled })}{b.allowance !== 0 && <span className="text-muted"> · {t("tm.lv.allowance")} {b.allowance > 0 ? "+" : ""}{b.allowance}</span>}</span>
                    {canGive && <Button variant="quiet" onClick={() => { setDays(""); setReason(""); setGiving(b); }}>{t("tm.lv.give")}</Button>}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={!!giving} onClose={() => setGiving(null)} title={giving ? `${pick(locale, giving.name, giving.name_local)} · ${giving.type_code} ${year}` : ""} closeLabel={t("tm.day.close")}
        footer={<Button disabled={saving} onClick={save}>{t("tm.lv.giveSave")}</Button>}>
        <div className="flex flex-col gap-3">
          <Input label={t("tm.lv.giveDays")} inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} />
          <Input label={t("tm.lv.giveReason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
      </BottomSheet>
    </>
  );
}
