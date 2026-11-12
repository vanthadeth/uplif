"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge, Button, SidePanel, Tabs, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

export interface CorrectionRow {
  id: string; employee_id: string; employee_name: string; employee_name_local: string | null; work_date: string;
  in_time: string | null; out_time: string | null; reason: string; status: string; decision_note: string | null; created_at: string;
}
type Tab = "pending" | "approved" | "rejected";

export function CorrectionsView({ requests }: { requests: Record<Tab, CorrectionRow[]> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [deciding, setDeciding] = useState<{ row: CorrectionRow; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));
  const times = (r: CorrectionRow) => [r.in_time && f("am.in", { t: r.in_time.slice(0, 5) }), r.out_time && f("am.out", { t: r.out_time.slice(0, 5) })].filter(Boolean).join(" · ");

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    const { error } = await createClient().rpc("decide_amendment", { p_id: deciding.row.id, p_approve: deciding.approve, p_note: note.trim() || null });
    setBusy(false);
    if (error) {
      toast("error", t(error.message.includes("already") ? "am.err.already" : error.code === "42501" ? "common.forbidden" : "common.saveError"));
      if (error.message.includes("already")) { setDeciding(null); router.refresh(); }
      return;
    }
    toast("success", t(deciding.approve ? "am.approved" : "am.rejected"));
    setDeciding(null); setNote("");
    router.refresh();
  }

  const list = requests[tab];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("am.title")}</h1>
        <p className="mt-1 max-w-[66ch] text-muted">{t("am.subtitle")}</p>
      </div>
      <Tabs label={t("am.tabs")} value={tab} onChange={(id) => setTab(id as Tab)}
        items={[{ id: "pending", label: `${t("am.tab.pending")}${requests.pending.length ? ` (${requests.pending.length})` : ""}` }, { id: "approved", label: t("am.tab.approved") }, { id: "rejected", label: t("am.tab.rejected") }]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {list.length === 0 ? (
          <div className="rounded-card border border-line bg-surface px-4 py-9 text-center">
            {tab === "pending" ? <><b className="block">{t("am.empty.pending")}</b><span className="text-muted">{t("am.empty.pendingBody")}</span></> : <span className="text-muted">{t("am.empty.other")}</span>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {list.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <b className="block break-words font-semibold">{pick(locale, r.employee_name, r.employee_name_local)}</b>
                  <span className="text-sm text-muted">{fmtDate(locale, r.work_date)} · {times(r)}</span>
                  <span className="block text-sm text-muted">{f("am.reason", { reason: r.reason })}</span>
                  {r.decision_note && <span className="block text-sm text-muted">{f("am.decisionNote", { note: r.decision_note })}</span>}
                </div>
                {tab === "pending" ? (
                  <div className="flex gap-2">
                    <Button onClick={() => { setNote(""); setDeciding({ row: r, approve: false }); }}><X className="size-4" aria-hidden />{t("am.reject")}</Button>
                    <Button variant="primary" onClick={() => { setNote(""); setDeciding({ row: r, approve: true }); }}><Check className="size-4" aria-hidden />{t("am.approve")}</Button>
                  </div>
                ) : <Badge tone={tab === "approved" ? "success" : "danger"}>{t(tab === "approved" ? "am.tab.approved" : "am.tab.rejected")}</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      <SidePanel open={deciding !== null} onClose={() => setDeciding(null)} closeLabel={t("common.close")} title={t("am.decide.title")}
        footer={deciding && <><Button onClick={() => setDeciding(null)}>{t("common.cancel")}</Button>
          <Button variant={deciding.approve ? "primary" : "danger"} loading={busy} onClick={decide}>{t(deciding.approve ? "am.approve" : "am.reject")}</Button></>}>
        {deciding && (
          <div className="flex flex-col gap-4">
            <div>
              <b className="block">{pick(locale, deciding.row.employee_name, deciding.row.employee_name_local)}</b>
              <span className="text-sm text-muted">{fmtDate(locale, deciding.row.work_date)} · {times(deciding.row)}</span>
              <span className="block text-sm text-muted">{f("am.reason", { reason: deciding.row.reason })}</span>
            </div>
            <Textarea label={t("am.note")} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </SidePanel>
    </div>
  );
}
