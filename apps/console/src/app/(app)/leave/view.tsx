"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Badge, Button, Input, SidePanel, Tabs, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

export interface LeaveRequestRow {
  id: string; employee_id: string; employee_name: string; employee_name_local: string | null;
  type_code: string; type_name: string; type_name_local: string | null; start_date: string; end_date: string;
  half: string; days: number; reason: string | null; status: string; decision_note: string | null; created_at: string;
}
export interface LeaveTypeRow { id: string; code: string; name: string; name_local: string | null; paid: boolean; annual_days: number | null; active: boolean }
interface TypeDraft { id: string | null; code: string; name: string; nameLocal: string; paid: boolean; days: string; active: boolean }
type Tab = "pending" | "approved" | "rejected";

export function LeaveView({ canReview, canManage, requests, types }: {
  canReview: boolean; canManage: boolean; requests: Record<Tab, LeaveRequestRow[]>; types: LeaveTypeRow[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [deciding, setDeciding] = useState<{ row: LeaveRequestRow; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));
  const days = (n: number) => (n === 1 ? t("lv.day.one") : f("lv.days", { n }));
  const range = (r: LeaveRequestRow) => (r.start_date === r.end_date ? fmtDate(locale, r.start_date) : `${fmtDate(locale, r.start_date)} – ${fmtDate(locale, r.end_date)}`);

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    const { error: err } = await createClient().rpc("decide_leave", { p_id: deciding.row.id, p_approve: deciding.approve, p_note: note.trim() || null });
    setBusy(false);
    if (err) {
      toast("error", t(err.message.includes("balance") ? "lv.err.balance" : err.message.includes("already") ? "lv.err.already" : err.code === "42501" ? "common.forbidden" : "common.saveError"));
      if (err.message.includes("already")) { setDeciding(null); router.refresh(); }
      return;
    }
    toast("success", t(deciding.approve ? "lv.approved" : "lv.rejected"));
    setDeciding(null); setNote("");
    router.refresh();
  }

  function editType(r: LeaveTypeRow | "new") {
    setError(undefined);
    setDraft(r === "new" ? { id: null, code: "", name: "", nameLocal: "", paid: true, days: "", active: true }
      : { id: r.id, code: r.code, name: r.name, nameLocal: r.name_local ?? "", paid: r.paid, days: r.annual_days == null ? "" : String(r.annual_days), active: r.active });
  }
  async function saveType() {
    if (!draft) return;
    const n = draft.days.trim() === "" ? null : Number(draft.days);
    if (!draft.name.trim() || !draft.code.trim() || draft.code.trim().length > 4 || (n !== null && (Number.isNaN(n) || n < 0))) return setError(t("lv.type.err"));
    setBusy(true);
    const { error: err } = await createClient().rpc("save_leave_type", {
      p_id: draft.id, p_code: draft.code.trim().toUpperCase(), p_name: draft.name.trim(), p_name_local: draft.nameLocal.trim() || null,
      p_paid: draft.paid, p_annual_days: n, p_active: draft.active,
    });
    setBusy(false);
    if (err) return setError(t(err.code === "42501" ? "common.forbidden" : err.code === "23505" ? "lv.type.err" : "common.saveError"));
    toast("success", t("lv.type.saved"));
    setDraft(null);
    router.refresh();
  }

  const list = requests[tab];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{t("lv.title")}</h1>
        <p className="mt-1 max-w-[66ch] text-muted">{t("lv.subtitle")}</p>
      </div>

      {canReview && (
        <section className="flex flex-col gap-3">
          <Tabs label={t("lv.tabs")} value={tab} onChange={(id) => setTab(id as Tab)}
            items={[{ id: "pending", label: `${t("lv.tab.pending")}${requests.pending.length ? ` (${requests.pending.length})` : ""}` }, { id: "approved", label: t("lv.tab.approved") }, { id: "rejected", label: t("lv.tab.rejected") }]} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {list.length === 0 ? (
              <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
                {tab === "pending" ? <><b className="mb-1 block text-[15px] text-ink">{t("lv.empty.pending")}</b>{t("lv.empty.pendingBody")}</> : t("lv.empty.other")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {list.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <div className="min-w-0 flex-1 basis-64">
                      <b className="block break-words font-semibold">{pick(locale, r.employee_name, r.employee_name_local)}</b>
                      <span className="text-sm text-muted">
                        {pick(locale, r.type_name, r.type_name_local)} · {days(r.days)} · {range(r)}
                        {r.half !== "full" ? ` · ${t(r.half === "start" ? "lv.half.start" : "lv.half.end")}` : ""}
                      </span>
                      {r.reason && <span className="block text-sm text-muted">{f("lv.reason", { reason: r.reason })}</span>}
                      {r.decision_note && <span className="block text-sm text-muted">{f("lv.decisionNote", { note: r.decision_note })}</span>}
                    </div>
                    {tab === "pending" ? (
                      <div className="flex gap-2">
                        <Button onClick={() => { setNote(""); setDeciding({ row: r, approve: false }); }}><X className="size-4" aria-hidden />{t("lv.reject")}</Button>
                        <Button variant="primary" onClick={() => { setNote(""); setDeciding({ row: r, approve: true }); }}><Check className="size-4" aria-hidden />{t("lv.approve")}</Button>
                      </div>
                    ) : <Badge tone={tab === "approved" ? "success" : "danger"}>{t(tab === "approved" ? "lv.tab.approved" : "lv.tab.rejected")}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("lv.types")}</h2>
            <p className="mt-1 max-w-[66ch] text-sm text-muted">{t("lv.typesHint")}</p>
          </div>
          {canManage && <Button onClick={() => editType("new")}><Plus className="size-[18px]" aria-hidden />{t("lv.type.add")}</Button>}
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {types.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <Badge tone="info">{r.code}</Badge>
              <div className="min-w-0 flex-1">
                <b className="block break-words font-semibold">{pick(locale, r.name, r.name_local)}</b>
                <span className="text-sm text-muted">{t(r.paid ? "lv.paid" : "lv.unpaid")} · {r.annual_days == null ? t("lv.type.noLimit") : f("lv.type.perYear", { n: r.annual_days })}</span>
              </div>
              {!r.active && <Badge tone="neutral">{t("lv.type.retired")}</Badge>}
              {canManage && <Button aria-label={t("common.edit")} className="w-11 px-0" onClick={() => editType(r)}><Pencil className="size-4" aria-hidden /></Button>}
            </div>
          ))}
        </div>
      </section>

      <SidePanel open={deciding !== null} onClose={() => setDeciding(null)} closeLabel={t("common.close")} title={t("lv.decide.title")}
        footer={deciding && <><Button onClick={() => setDeciding(null)}>{t("common.cancel")}</Button>
          <Button variant={deciding.approve ? "primary" : "danger"} loading={busy} onClick={decide}>{t(deciding.approve ? "lv.approve" : "lv.reject")}</Button></>}>
        {deciding && (
          <div className="flex flex-col gap-4">
            <div>
              <b className="block">{pick(locale, deciding.row.employee_name, deciding.row.employee_name_local)}</b>
              <span className="text-sm text-muted">{pick(locale, deciding.row.type_name, deciding.row.type_name_local)} · {days(deciding.row.days)} · {range(deciding.row)}</span>
              {deciding.row.reason && <span className="block text-sm text-muted">{f("lv.reason", { reason: deciding.row.reason })}</span>}
            </div>
            <Textarea label={t("lv.note")} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </SidePanel>

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("lv.type.edit") : t("lv.type.add")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={saveType}>{t("lv.type.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("lv.type.code")} value={draft.code} maxLength={4} disabled={draft.id !== null} onChange={(e) => { setDraft({ ...draft, code: e.target.value.toUpperCase() }); setError(undefined); }} />
            <Input label={t("lv.type.name")} value={draft.name} maxLength={80} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(undefined); }} />
            <Input label={t("lv.type.nameLocal")} value={draft.nameLocal} maxLength={80} onChange={(e) => setDraft({ ...draft, nameLocal: e.target.value })} />
            <Input label={t("lv.type.days")} inputMode="decimal" value={draft.days} onChange={(e) => { setDraft({ ...draft, days: e.target.value }); setError(undefined); }} />
            <Toggle checked={draft.paid} label={t("lv.type.paid")} onChange={(v) => setDraft({ ...draft, paid: v })} />
            <Toggle checked={draft.active} label={t("lv.type.active")} onChange={(v) => setDraft({ ...draft, active: v })} />
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
