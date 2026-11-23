"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, BottomSheet, Button, EmptyState, ErrorState, Input, Select, Skeleton, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTime } from "@/components/time-context";
import { languageOf } from "@/lib/languages";
import { money, pick } from "@/lib/format";
import { fill, type MessageKey } from "@/lib/messages";
import { RunReport } from "@/components/run-report";

type T = (k: MessageKey) => string;
export interface Plan { id: string; kind: string; name: string; name_local: string | null; open_day: number | null; covers: string; auto_open: boolean; active: boolean; rule_kind: string | null; rule_config: unknown }
interface Run { id: string; plan_id: string; plan_kind: string; name: string; period_start: string; period_end: string; open_date: string; status: string; slips: number; drafts: number; currency_code: string | null; net: number }
interface Slip { payslip_id: string; employee_id: string; name: string; name_local: string | null; status: string; currency_code: string; gross: number; deductions: number; net: number }
interface Line { id: string; pay_item_id: string; label: string; label_local: string | null; kind: string; qty: number; unit_amount: number; amount: number; source: string; source_ref: string | null; note: string | null }
interface Review { id: string; message: string; status: string; answer: string | null; requested_at: string }
interface SlipDetail { id: string; version: number; reviews: Review[]; status: string; run_status: string; currency_code: string; gross: number; deductions: number; net: number; lines: Line[]; snapshot: Record<string, unknown> }
interface Sug { code: string; pay_item_id: string; label: string; qty: number; unit_amount: number; amount: number; note: string }
interface Item { id: string; code: string; name: string; name_local: string | null; kind: string }

const statusTone = (s: string) => (s === "open" ? "info" : s === "paid" || s === "confirmed" ? "success" : s === "review_requested" ? "warning" : "neutral") as "info" | "success" | "warning" | "neutral";
const firstOfMonth = (back: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

/** Pay runs: each plan opens its own run; opening only creates drafts. */
export function RunsView({ t, locale }: { t: T; locale: string }) {
  const { canRuns } = useTime();
  const toast = useToast();
  const tag = languageOf(locale).dateTag;
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Run | null>(null);
  const [planId, setPlanId] = useState("");
  const [month, setMonth] = useState(firstOfMonth(0));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRuns(null); setFailed(false);
    const supabase = createClient();
    const [r, p] = await Promise.all([supabase.rpc("payroll_runs"), supabase.rpc("payroll_plans")]);
    if (r.error) { setFailed(true); return; }
    setRuns((r.data ?? []) as Run[]);
    const list = ((p.data ?? []) as Plan[]).filter((x) => x.active);
    setPlans(list); setPlanId((v) => v || list[0]?.id || "");
  }, []);
  useEffect(() => { load(); }, [load]);

  const plan = plans.find((p) => p.id === planId);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(tag, { day: "numeric", month: "short" });
  const months = useMemo(() => [0, 1, 2, 3].map((b) => firstOfMonth(b)), []);

  async function openRun() {
    if (!plan) return;
    setBusy(true);
    const { error } = await createClient().rpc("payroll_open_run", { p_plan_id: plan.id, p_month: month, p_name: plan.kind === "bonus" ? name.trim() || null : null });
    setBusy(false);
    if (error) { toast("error", t(error.code === "P0001" ? "tm.pr.err.status" : "tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.runs.opened")); setName(""); load();
  }

  if (failed) return <ErrorState title={t("tm.pr.runs.err")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />;
  return (
    <>
      {canRuns && plans.length > 0 && (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <b>{t("tm.pr.runs.open")}</b>
          <Select label={t("tm.pr.runs.plan")} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{pick(locale, p.name, p.name_local)}</option>)}
          </Select>
          <Select label={t("tm.pr.runs.month")} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{new Date(`${m}T00:00:00`).toLocaleDateString(tag, { month: "long", year: "numeric" })}</option>)}
          </Select>
          {plan?.kind === "bonus" && <Input label={t("tm.pr.runs.name")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
          <Button disabled={busy} onClick={openRun}>{t("tm.pr.runs.go")}</Button>
        </section>
      )}
      {runs === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>
      ) : runs.length === 0 ? (
        <EmptyState title={t("tm.pr.runs.empty")} />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {runs.map((r) => (
            <li key={r.id} className="border-b border-line last:border-b-0">
              <button type="button" className="flex min-h-14 w-full flex-col gap-1 px-4 py-3 text-start" onClick={() => setOpen(r)}>
                <span className="flex items-center justify-between gap-2"><b>{r.name}</b><Badge tone={statusTone(r.status)}>{t(`tm.pr.st.${r.status}` as MessageKey)}</Badge></span>
                <span className="text-sm text-muted">
                  {fill(t("tm.pr.runs.period"), { from: fmt(r.period_start), to: fmt(r.period_end) })} · {fill(t("tm.pr.runs.slips"), { n: r.slips })}
                  {r.drafts > 0 && ` · ${fill(t("tm.pr.runs.drafts"), { n: r.drafts })}`}
                  {r.currency_code && ` · ${money(locale, r.net, r.currency_code)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <RunSheet t={t} locale={locale} run={open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

const errKey = (e: { code?: string; message: string }): MessageKey =>
  e.message.includes("empty") ? "tm.pr.err.empty" : e.message.includes("second") ? "tm.pr.err.second" : e.message.includes("reason") ? "tm.pr.err.reason" : e.code === "P0001" ? "tm.pr.err.status" : "tm.pr.err.generic";

function RunSheet({ t, locale, run, onClose, onChanged }: { t: T; locale: string; run: Run | null; onClose: () => void; onChanged: () => void }) {
  const { canPrepare, canPost } = useTime();
  const toast = useToast();
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [reporting, setReporting] = useState(false);
  const [people, setPeople] = useState<{ employee_id: string; name: string; name_local: string | null; pay_currency: string | null }[]>([]);
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState("");
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isBonus = run?.plan_kind === "bonus";

  const load = useCallback(async (id: string) => {
    setSlips(null);
    const { data } = await createClient().rpc("payroll_run_slips", { p_run_id: id });
    setSlips((data ?? []) as Slip[]);
  }, []);
  useEffect(() => {
    if (!run) return;
    load(run.id); setAmount(""); setNote("");
    if (run.plan_kind === "bonus" && canPrepare) {
      const supabase = createClient();
      Promise.all([supabase.rpc("payroll_people"), supabase.from("company_currencies").select("code, is_home").order("code")]).then(([p, c]) => {
        const list = (p.data ?? []) as { employee_id: string; name: string; name_local: string | null; pay_currency: string | null }[];
        setPeople(list); setWho((v) => v || list[0]?.employee_id || "");
        const codes = (c.data ?? []).map((x) => x.code); setCurrencies(codes); setCur((v) => v || (c.data ?? []).find((x) => x.is_home)?.code || codes[0] || "");
      });
    }
  }, [run, load, canPrepare]);

  async function refresh() {
    if (!run) return;
    setBusy(true);
    const { error } = await createClient().rpc("payroll_refresh_run", { p_run_id: run.id });
    setBusy(false);
    if (error) { toast("error", t(error.code === "P0001" ? "tm.pr.err.status" : "tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.runs.refreshed")); load(run.id); onChanged();
  }
  async function postAll() {
    if (!run) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("payroll_post_run", { p_run_id: run.id });
    setBusy(false);
    if (error) { toast("error", t(errKey(error))); return; }
    const r = data as { posted: number; skipped: number };
    toast(r.posted > 0 ? "success" : "error", fill(t("tm.pr.postedAll"), { n: r.posted, s: r.skipped })); load(run.id); onChanged();
  }
  async function addBonus() {
    if (!run) return;
    const n = Number(amount);
    if (!who || !Number.isFinite(n) || n <= 0) { toast("error", t("tm.pr.err.line")); return; }
    setBusy(true);
    const { error } = await createClient().rpc("payroll_add_bonus", { p_run_id: run.id, p_employee_id: who, p_amount: n, p_currency: cur, p_note: note.trim() || null });
    setBusy(false);
    if (error) { toast("error", t(error.code === "P0001" ? "tm.pr.err.line" : "tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.saved")); setAmount(""); setNote(""); load(run.id); onChanged();
  }

  return (
    <>
      <BottomSheet open={!!run && !slip && !reporting} onClose={onClose} title={run?.name ?? ""} closeLabel={t("tm.day.close")}>
        <div className="flex flex-col gap-4">
          {run && (slips ?? []).some((x) => x.status !== "draft") && <Button variant="secondary" onClick={() => setReporting(true)}>{t("tm.pr.report")}</Button>}
          {run?.status === "open" && canPost && (slips ?? []).some((x) => x.status === "draft") && <Button disabled={busy} onClick={postAll}>{t("tm.pr.postAll")}</Button>}
          {run?.status === "open" && canPrepare && !isBonus && <Button variant="secondary" disabled={busy} onClick={refresh}><RefreshCw className="size-4" aria-hidden />{t("tm.pr.runs.refresh")}</Button>}
          {slips === null ? <Skeleton className="h-16 w-full rounded-card" /> : slips.length === 0 ? <p className="text-sm text-muted">{t("tm.pr.runs.noSlips")}</p> : (
            <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
              {slips.map((s) => (
                <li key={s.payslip_id} className="border-b border-line last:border-b-0">
                  <button type="button" className="flex min-h-14 w-full items-center justify-between gap-2 px-3 py-2 text-start" onClick={() => setSlip(s)}>
                    <span className="flex flex-col"><b>{pick(locale, s.name, s.name_local)}</b><span className="text-sm text-muted">{t(`tm.pr.st.${s.status}` as MessageKey)}</span></span>
                    <b>{money(locale, s.net, s.currency_code)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isBonus && run?.status === "open" && canPrepare && (
            <section className="flex flex-col gap-3">
              <b>{t("tm.pr.bonus.add")}</b>
              <Select label={t("tm.pr.bonus.person")} value={who} onChange={(e) => setWho(e.target.value)}>
                {people.map((p) => <option key={p.employee_id} value={p.employee_id}>{pick(locale, p.name, p.name_local)}</option>)}
              </Select>
              <Input label={t("tm.pr.amount")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Select label={t("tm.pr.currency")} value={cur} onChange={(e) => setCur(e.target.value)}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
              <Input label={t("tm.pr.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              <Button disabled={busy} onClick={addBonus}>{t("tm.pr.save")}</Button>
            </section>
          )}
        </div>
      </BottomSheet>
      <RunReport t={t} locale={locale} run={reporting && run ? run : null} onClose={() => setReporting(false)} onChanged={() => { if (run) load(run.id); onChanged(); }} />
      <SlipSheet t={t} locale={locale} slip={slip} onClose={() => setSlip(null)} onChanged={() => { if (run) load(run.id); onChanged(); }} />
    </>
  );
}

function SlipSheet({ t, locale, slip, onClose, onChanged }: { t: T; locale: string; slip: Slip | null; onClose: () => void; onChanged: () => void }) {
  const { canPrepare, canPost } = useTime();
  const toast = useToast();
  const [answer, setAnswer] = useState("");
  const [d, setD] = useState<SlipDetail | null>(null);
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    const supabase = createClient();
    const { data } = await supabase.rpc("payroll_payslip", { p_payslip_id: id });
    const det = data as unknown as SlipDetail;
    setD(det);
    if (det.status === "draft" && det.run_status === "open") {
      const s = await supabase.rpc("payroll_suggestions", { p_payslip_id: id });
      setSugs((s.data ?? []) as Sug[]);
    } else setSugs([]);
  }, []);
  useEffect(() => {
    if (!slip) return;
    setD(null); setEditing(null); setQty("1"); setUnit(""); setNote(""); setAnswer("");
    load(slip.payslip_id);
    createClient().rpc("payroll_pay_items").then(({ data }) => { const l = (data ?? []) as Item[]; setItems(l); setItemId(l.find((i) => i.code === "FINE")?.id ?? l[0]?.id ?? ""); });
  }, [slip, load]);

  const editable = !!d && d.status === "draft" && d.run_status === "open" && canPrepare;
  const cur = d?.currency_code ?? "USD";
  const snap = d?.snapshot ?? {};
  const num = (k: string) => Number(snap[k] ?? 0);

  async function save(line: Line | null, p?: { item: string; qty: number; unit: number; note: string | null; source?: string }) {
    if (!slip) return;
    const q = p ? p.qty : Number(qty), u = p ? p.unit : Number(unit);
    if (!Number.isFinite(q) || !Number.isFinite(u) || u < 0 || q < 0) { toast("error", t("tm.pr.err.line")); return; }
    setBusy(true);
    const { error } = await createClient().rpc("payroll_save_line", {
      p_payslip_id: slip.payslip_id, p_line_id: line?.id ?? null, p_pay_item_id: p?.item ?? line?.pay_item_id ?? itemId, p_qty: q, p_unit_amount: u, p_note: (p ? p.note : note.trim()) || null, p_source: p?.source ?? "manual",
    });
    setBusy(false);
    if (error) { toast("error", t(error.message.includes("reason") ? "tm.pr.err.reason" : error.code === "P0001" ? "tm.pr.err.status" : "tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.slip.saved")); setEditing(null); setUnit(""); setNote(""); setQty("1");
    await load(slip.payslip_id); onChanged();
  }
  async function remove(l: Line) {
    if (!slip) return;
    setBusy(true);
    const { error } = await createClient().rpc("payroll_delete_line", { p_line_id: l.id });
    setBusy(false);
    if (error) { toast("error", t("tm.pr.err.status")); return; }
    await load(slip.payslip_id); onChanged();
  }
  async function post() {
    if (!slip) return;
    setBusy(true);
    const { error } = await createClient().rpc("payroll_post", { p_payslip_id: slip.payslip_id });
    setBusy(false);
    if (error) { toast("error", t(errKey(error))); return; }
    toast("success", t("tm.pr.posted")); await load(slip.payslip_id); onChanged();
  }
  const openReview = d?.reviews.find((r) => r.status === "open");
  async function reply(revise: boolean) {
    if (!slip || !openReview) return;
    if (!revise && answer.trim().length < 3) { toast("error", t("tm.pr.rv.needAnswer")); return; }
    setBusy(true);
    const { error } = revise
      ? await createClient().rpc("payroll_revise_payslip", { p_review_id: openReview.id, p_note: answer.trim() || null })
      : await createClient().rpc("payroll_answer_review", { p_review_id: openReview.id, p_answer: answer.trim() });
    setBusy(false);
    if (error) { toast("error", t(errKey(error))); return; }
    toast("success", t(revise ? "tm.pr.rv.revised" : "tm.pr.rv.answered")); setAnswer("");
    if (revise) { onChanged(); onClose(); return; }
    await load(slip.payslip_id); onChanged();
  }
  const startEdit = (l: Line) => { setEditing(l.id); setQty(String(l.qty)); setUnit(String(l.unit_amount)); setNote(l.note ?? ""); };

  return (
    <BottomSheet open={!!slip} onClose={onClose} title={slip ? pick(locale, slip.name, slip.name_local) : ""} closeLabel={t("tm.day.close")}>
      {!d ? <Skeleton className="h-24 w-full rounded-card" /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between"><Badge tone={statusTone(d.status)}>{t(`tm.pr.st.${d.status}` as MessageKey)}</Badge><b className="text-xl">{money(locale, d.net, cur)}</b></div>
          <p className="text-sm text-muted">{t("tm.pr.slip.earnings")} {money(locale, d.gross, cur)} · {t("tm.pr.slip.deductions")} {money(locale, d.deductions, cur)}</p>
          {"work_days" in snap && num("work_days") > 0 && <p className="text-sm text-muted">{fill(t("tm.pr.slip.summary"), { w: num("work_days"), a: num("absent_days"), l: num("late_min"), o: num("overtime_min"), v: num("leave_days") })}</p>}
          {d.version > 1 && <p className="text-sm text-muted">{fill(t("tm.pr.slip.version"), { n: d.version })}</p>}
          {!editable && <p className="text-sm text-muted">{t("tm.pr.slip.locked")}</p>}
          {d.reviews.length > 0 && (
            <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
              <b>{t(openReview ? "tm.pr.rv.title" : "tm.pr.rv.past")}</b>
              {d.reviews.map((r) => (
                <div key={r.id} className="flex flex-col gap-1 text-sm">
                  <span>{r.message}</span>
                  {r.answer && <span className="text-muted">{r.answer}</span>}
                </div>
              ))}
              {openReview && canPrepare && (
                <>
                  <Input label={t("tm.pr.rv.answer")} value={answer} maxLength={500} onChange={(e) => setAnswer(e.target.value)} />
                  <div className="flex gap-2"><Button disabled={busy} onClick={() => reply(false)}>{t("tm.pr.rv.stand")}</Button><Button variant="secondary" disabled={busy || d.run_status !== "open"} onClick={() => reply(true)}>{t("tm.pr.rv.revise")}</Button></div>
                </>
              )}
            </section>
          )}
          {d.status === "draft" && d.run_status === "open" && canPost && <Button disabled={busy} onClick={post}>{t("tm.pr.post")}</Button>}
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
            {d.lines.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex flex-col"><b>{pick(locale, l.label, l.label_local)}</b><span className="text-sm text-muted">{t(`tm.pr.src.${l.source}` as MessageKey)}{l.source === "override" && l.source_ref ? ` · ${fill(t("tm.pr.src.wasRule"), { n: l.source_ref })}` : ""}</span></span>
                  <b className={l.kind === "deduction" ? "text-danger" : ""}>{l.kind === "deduction" ? "−" : ""}{money(locale, l.amount, cur)}</b>
                </div>
                {l.note && <p className="text-sm text-muted">{l.note}</p>}
                {editable && editing !== l.id && (
                  <div className="flex gap-2"><Button variant="quiet" onClick={() => startEdit(l)}>{t("tm.pr.slip.change")}</Button><Button variant="quiet" disabled={busy} onClick={() => remove(l)}>{t("tm.pr.slip.remove")}</Button></div>
                )}
                {editable && editing === l.id && (
                  <div className="flex flex-col gap-2">
                    <Input label={t("tm.pr.slip.qty")} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
                    <Input label={t("tm.pr.slip.unit")} inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} />
                    <Input label={t("tm.pr.slip.reason")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex gap-2"><Button disabled={busy} onClick={() => save(l)}>{t("tm.pr.save")}</Button><Button variant="secondary" onClick={() => setEditing(null)}>{t("tm.day.close")}</Button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {editable && sugs.length > 0 && (
            <section className="flex flex-col gap-2">
              <b>{t("tm.pr.sug.title")}</b>
              <p className="text-sm text-muted">{t("tm.pr.sug.hint")}</p>
              {sugs.map((s) => (
                <div key={s.code} className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2">
                  <span className="flex flex-col"><b>{s.label}</b><span className="text-sm text-muted">{s.note}</span></span>
                  <Button variant="secondary" disabled={busy} onClick={() => save(null, { item: s.pay_item_id, qty: s.qty, unit: s.unit_amount, note: s.note, source: "suggested" })}>{t("tm.pr.sug.add")} {money(locale, s.amount, cur)}</Button>
                </div>
              ))}
            </section>
          )}
          {editable && (
            <section className="flex flex-col gap-3">
              <b>{t("tm.pr.slip.add")}</b>
              <Select label={t("tm.pr.item")} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((i) => <option key={i.id} value={i.id}>{pick(locale, i.name, i.name_local)}</option>)}
              </Select>
              <Input label={t("tm.pr.slip.qty")} inputMode="decimal" value={editing ? "1" : qty} disabled={!!editing} onChange={(e) => setQty(e.target.value)} />
              <Input label={t("tm.pr.slip.unit")} inputMode="decimal" value={editing ? "" : unit} disabled={!!editing} onChange={(e) => setUnit(e.target.value)} />
              <Input label={t("tm.pr.note")} value={editing ? "" : note} disabled={!!editing} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              <Button disabled={busy || !!editing} onClick={() => save(null)}>{t("tm.pr.save")}</Button>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/** Pay plans and their rules, in Settings. A new rule starts on a date, so earlier runs keep the rule they were built with. */
export function PlansForm({ t, locale }: { t: T; locale: string }) {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setPlans(null); setFailed(false);
    const { data, error } = await createClient().rpc("payroll_plans");
    if (error) { setFailed(true); return; }
    setPlans((data ?? []) as Plan[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (failed) return <ErrorState title={t("tm.pr.runs.err")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />;
  if (!plans) return <Skeleton className="h-32 w-full rounded-card" />;
  return (
    <section className="flex flex-col gap-3">
      <b>{t("tm.pr.plans.title")}</b>
      {plans.map((p) => <PlanCard key={p.id} t={t} locale={locale} plan={p} onSaved={() => { toast("success", t("tm.pr.saved")); load(); }} onError={(k) => toast("error", t(k))} />)}
    </section>
  );
}

const cfgToText = (p: Plan) => {
  const c = (p.rule_config ?? {}) as { bands?: { min: number; pct: number }[]; tiers?: { from: number; rate_pct: number }[]; rate_pct?: number };
  if (p.rule_kind === "kpi_bands") return (c.bands ?? []).map((b) => `${b.min}:${b.pct}`).join("\n");
  if (p.rule_kind === "sales_tiers") return (c.tiers ?? []).map((x) => `${x.from}:${x.rate_pct}`).join("\n");
  return String(c.rate_pct ?? "");
};

function PlanCard({ t, locale, plan, onSaved, onError }: { t: T; locale: string; plan: Plan; onSaved: () => void; onError: (k: MessageKey) => void }) {
  const [day, setDay] = useState(plan.open_day ? String(plan.open_day) : "");
  const [covers, setCovers] = useState(plan.covers);
  const [auto, setAuto] = useState(plan.auto_open);
  const [active, setActive] = useState(plan.active);
  const [mode, setMode] = useState<"flat" | "tiers">(plan.rule_kind === "sales_tiers" ? "tiers" : "flat");
  const [text, setText] = useState(cfgToText(plan));
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const hasRule = plan.kind === "achievement" || plan.kind === "commission";

  async function savePlan() {
    setBusy(true);
    const { error } = await createClient().rpc("payroll_save_plan", { p_plan_id: plan.id, p_open_day: plan.kind === "bonus" ? null : Number(day), p_covers: covers, p_auto_open: auto, p_active: active });
    setBusy(false);
    if (error) { onError(error.code === "P0001" ? "tm.pr.plans.err" : "tm.pr.err.generic"); return; }
    onSaved();
  }
  async function saveRule() {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(":").map((x) => Number(x.trim())));
    let kind: string, config: Record<string, unknown>;
    if (plan.kind === "achievement") { kind = "kpi_bands"; config = { bands: lines.map(([min, pct]) => ({ min, pct })) }; }
    else if (mode === "tiers") { kind = "sales_tiers"; config = { tiers: lines.map(([f, r]) => ({ from: f, rate_pct: r })) }; }
    else { kind = "sales_rate"; config = { rate_pct: Number(text.trim()) }; }
    if (JSON.stringify(config).includes("null") || JSON.stringify(config).includes("NaN")) { onError("tm.pr.rule.err"); return; }
    setBusy(true);
    const { error } = await createClient().rpc("payroll_save_rule", { p_plan_id: plan.id, p_kind: kind, p_config: config as never, p_from: from });
    setBusy(false);
    if (error) { onError(error.code === "P0001" ? "tm.pr.rule.err" : "tm.pr.err.generic"); return; }
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <b>{pick(locale, plan.name, plan.name_local)}</b>
      {plan.kind === "bonus" ? <p className="text-sm text-muted">{t("tm.pr.plans.noDay")}</p> : (
        <>
          <Input label={t("tm.pr.plans.openDay")} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          {plan.kind === "fixed" && (
            <Select label={t("tm.pr.plans.covers")} value={covers} onChange={(e) => setCovers(e.target.value)}>
              <option value="cutoff">{t("tm.pr.plans.cutoff")}</option>
              <option value="calendar_month">{t("tm.pr.plans.month")}</option>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{t("tm.pr.plans.auto")}</label>
        </>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{t("tm.pr.plans.active")}</label>
      <Button variant="secondary" disabled={busy} onClick={savePlan}>{t("tm.pr.save")}</Button>
      {hasRule && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <b>{t("tm.pr.rule.title")}</b>
          {plan.kind === "commission" && (
            <Select label={t("tm.pr.rule.title")} value={mode} onChange={(e) => { setMode(e.target.value as "flat" | "tiers"); setText(""); }}>
              <option value="flat">{t("tm.pr.rule.kind.flat")}</option>
              <option value="tiers">{t("tm.pr.rule.kind.tiers")}</option>
            </Select>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span>{plan.kind === "achievement" ? t("tm.pr.rule.bands") : mode === "tiers" ? t("tm.pr.rule.tiers") : t("tm.pr.rule.rate")}</span>
            <textarea className="min-h-24 rounded-card border border-line bg-surface p-2 text-base" value={text} onChange={(e) => setText(e.target.value)} inputMode={plan.kind === "commission" && mode === "flat" ? "decimal" : "text"} />
          </label>
          <Input label={t("tm.pr.rule.starts")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Button disabled={busy} onClick={saveRule}>{t("tm.pr.save")}</Button>
        </div>
      )}
    </div>
  );
}
