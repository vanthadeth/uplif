"use client";
import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Badge, BottomSheet, Button, Card, EmptyState, ErrorState, Input, Reveal, Skeleton, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface Slip { id: string; run_name: string; plan_kind: string; period_start: string; period_end: string; version: number; is_current: boolean; status: string; currency_code: string; net: number; posted_at: string; confirmed_at: string | null }
interface Line { label: string; label_local: string | null; kind: string; qty: number; unit_amount: number; amount: number; note: string | null }
interface Review { message: string; status: string; answer: string | null }
interface Detail { id: string; run_name: string; version: number; is_current: boolean; status: string; currency_code: string; gross: number; deductions: number; net: number; lines: Line[]; reviews: Review[] }

const tone = (s: string) => (s === "confirmed" ? "success" : s === "posted" ? "info" : s === "review_requested" ? "warning" : "neutral") as "success" | "info" | "warning" | "neutral";

/** The person's own posted payslips. Read only: confirm them, or ask for a review. Drafts are never shown. */
export function PayslipsView() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await createClient().rpc("my_payslips");
    if (error) { setFailed(true); return; }
    setSlips(data as Slip[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadOne = useCallback(async (id: string) => {
    const { data } = await createClient().rpc("my_payslip", { p_payslip_id: id });
    setD((data ?? null) as unknown as Detail | null);
  }, []);
  useEffect(() => { if (open) { setD(null); setAsking(false); setMsg(""); void loadOne(open); } }, [open, loadOne]);

  const money = (n: number, c: string) => { try { return new Intl.NumberFormat(locale, { style: "currency", currency: c }).format(n); } catch { return `${n} ${c}`; } };
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(tag, { day: "numeric", month: "short" });
  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const err = (e: { code?: string; message: string }): MessageKey => (e.message.includes("reason") ? "st.pay.err.reason" : e.code === "P0001" || e.code === "P0002" ? "st.pay.err.status" : "st.pay.err.generic");

  async function confirm() {
    if (!open) return;
    setBusy(true);
    const { error } = await createClient().rpc("my_confirm_payslip", { p_payslip_id: open });
    setBusy(false);
    if (error) { toast("error", t(err(error))); return; }
    toast("success", t("st.pay.confirmed")); await loadOne(open); void load();
  }
  async function ask() {
    if (!open) return;
    if (msg.trim().length < 3) { toast("error", t("st.pay.err.reason")); return; }
    setBusy(true);
    const { error } = await createClient().rpc("my_request_payslip_review", { p_payslip_id: open, p_message: msg.trim() });
    setBusy(false);
    if (error) { toast("error", t(err(error))); return; }
    toast("success", t("st.pay.asked")); setAsking(false); setMsg(""); await loadOne(open); void load();
  }

  if (failed) return <ErrorState title={t("st.pay.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!slips) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.pay.loading")}><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
  if (slips.length === 0) return <EmptyState title={t("st.pay.empty.title")} body={t("st.pay.empty.body")} />;

  return (
    <Reveal className="flex flex-col gap-3">
      <Card className="divide-y divide-line overflow-hidden">
        {slips.map((s) => (
          <button key={s.id} type="button" onClick={() => setOpen(s.id)} className="flex min-h-15 w-full flex-col gap-1 p-4 text-start hover:bg-ground">
            <span className="flex items-center justify-between gap-2"><b>{s.run_name}</b><Badge tone={tone(s.status)}>{t(`st.pay.st.${s.status}` as MessageKey)}</Badge></span>
            <span className="flex items-center justify-between gap-2 text-sm text-muted">
              <span>{fill(t("st.pay.period"), { from: day(s.period_start), to: day(s.period_end) })}{s.version > 1 ? ` · ${fill(t("st.pay.version"), { n: s.version })}` : ""}</span>
              <b className="text-ink">{money(s.net, s.currency_code)}</b>
            </span>
          </button>
        ))}
      </Card>
      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={d?.run_name ?? ""} closeLabel={t("st.account.close")}>
        {!d ? <Skeleton className="h-24" /> : (
          <div className="print-area flex flex-col gap-4">
            <div className="flex items-center justify-between"><Badge tone={tone(d.status)}>{t(`st.pay.st.${d.status}` as MessageKey)}</Badge><b className="text-xl">{money(d.net, d.currency_code)}</b></div>
            {d.version > 1 && <p className="m-0 text-sm text-muted">{fill(t("st.pay.version"), { n: d.version })}</p>}
            {!d.is_current && <p className="m-0 text-sm text-muted">{t("st.pay.replaced")}</p>}
            <p className="m-0 text-sm text-muted">{t("st.pay.earnings")} {money(d.gross, d.currency_code)} · {t("st.pay.deductions")} {money(d.deductions, d.currency_code)}</p>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line p-0">
              {d.lines.map((l, i) => (
                <li key={i} className="flex flex-col gap-1 border-b border-line px-3 py-2 last:border-b-0">
                  <span className="flex items-center justify-between gap-2"><b>{local(l.label, l.label_local)}</b><b className={l.kind === "deduction" ? "text-danger" : ""}>{l.kind === "deduction" ? "−" : ""}{money(l.amount, d.currency_code)}</b></span>
                  {l.note && <span className="text-sm text-muted">{l.note}</span>}
                </li>
              ))}
            </ul>
            {d.reviews.map((r, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-card bg-ground p-3 text-sm">
                <span>{fill(t("st.pay.youAsked"), { text: r.message })}</span>
                <span className="text-muted">{r.answer ? fill(t("st.pay.answer"), { text: r.answer }) : t("st.pay.waiting")}</span>
              </div>
            ))}
            <Button variant="quiet" className="no-print" onClick={() => window.print()}><Printer className="size-4" aria-hidden />{t("st.pay.print")}</Button>
            {d.status === "posted" && d.is_current && !asking && (
              <div className="no-print flex flex-col gap-2">
                <Button disabled={busy} onClick={confirm}>{t("st.pay.confirm")}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>{t("st.pay.ask")}</Button>
              </div>
            )}
            {asking && (
              <div className="no-print flex flex-col gap-2">
                <Input label={t("st.pay.ask.label")} value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} />
                <div className="flex gap-2"><Button disabled={busy} onClick={ask}>{t("st.pay.ask.send")}</Button><Button variant="secondary" onClick={() => setAsking(false)}>{t("st.account.close")}</Button></div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </Reveal>
  );
}
