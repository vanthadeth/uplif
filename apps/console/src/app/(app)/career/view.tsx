"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge, Button, Input, Select, SidePanel, Tabs, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pick } from "@/lib/format";
import { languageOf } from "@/lib/languages";
import type { MessageKey } from "@/lib/messages";

export interface PositionRow { id: string; name: string; name_local: string | null }
export interface DescRow { position_id: string; summary: string | null; summary_local: string | null; duties: string | null; duties_local: string | null }
export interface EventRow { id: string; employee_id: string; kind: "promotion" | "transfer"; event_date: string; from_name: string | null; from_name_local: string | null; to_name: string; to_name_local: string | null; note: string | null }
export interface PersonRow { id: string; name: string; name_local: string | null; position_id: string | null; status: string }
interface JdDraft { position: PositionRow; summary: string; summaryLocal: string; duties: string; dutiesLocal: string }
interface PrDraft { employee: string; kind: "promotion" | "transfer"; position: string; date: string; note: string }

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const lines = (s: string | null) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean).length;

export function CareerView({ positions, descriptions, events, people }: { positions: PositionRow[]; descriptions: DescRow[]; events: EventRow[]; people: PersonRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"jd" | "history">("jd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));
  const date = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(languageOf(locale).dateTag, { day: "numeric", month: "short", year: "numeric" });

  // ----- job descriptions -----
  const [jd, setJd] = useState<JdDraft | null>(null);
  const editJd = (p: PositionRow) => {
    const d = descriptions.find((x) => x.position_id === p.id);
    setError(undefined);
    setJd({ position: p, summary: d?.summary ?? "", summaryLocal: d?.summary_local ?? "", duties: d?.duties ?? "", dutiesLocal: d?.duties_local ?? "" });
  };
  async function saveJd() {
    if (!jd) return;
    setBusy(true);
    const { error: err } = await createClient().rpc("save_position_description", {
      p_position_id: jd.position.id, p_summary: jd.summary || null, p_summary_local: jd.summaryLocal || null, p_duties: jd.duties || null, p_duties_local: jd.dutiesLocal || null,
    });
    setBusy(false);
    if (err) { setError(t(err.code === "42501" ? "common.forbidden" : "common.saveError")); return; }
    toast("success", t("cr.jd.saved"));
    setJd(null);
    router.refresh();
  }

  // ----- promotions -----
  const active = people.filter((p) => p.status !== "left");
  const nameOf = (id: string) => { const p = people.find((x) => x.id === id); return p ? pick(locale, p.name, p.name_local) : "—"; };
  const [pr, setPr] = useState<PrDraft | null>(null);
  const newPr = () => { setError(undefined); setPr({ employee: active[0]?.id ?? "", kind: "promotion", position: "", date: today(), note: "" }); };
  async function savePr() {
    if (!pr) return;
    if (!pr.employee || !pr.position || !pr.date) { setError(t("cr.pr.err.need")); return; }
    setBusy(true);
    const { error: err } = await createClient().rpc("record_career_event", { p_employee_id: pr.employee, p_kind: pr.kind, p_position_id: pr.position, p_date: pr.date, p_note: pr.note.trim() || null });
    setBusy(false);
    if (err) {
      setError(t(err.code === "42501" ? "common.forbidden" : err.message.includes("already") ? "cr.pr.err.same" : err.code === "22023" ? "cr.pr.err.date" : "common.saveError"));
      return;
    }
    toast("success", t("cr.pr.saved"));
    setPr(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("cr.title")}</h1>
        <p className="mt-1 max-w-[66ch] text-muted">{t("cr.subtitle")}</p>
      </div>
      <Tabs label={t("cr.tabs")} value={tab} onChange={(id) => setTab(id as "jd" | "history")}
        items={[{ id: "jd", label: t("cr.tab.jd") }, { id: "history", label: t("cr.tab.history") }]} />

      {tab === "jd" && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-jd" aria-labelledby="tab-jd">
          <p className="m-0 max-w-[66ch] text-sm text-muted">{t("cr.jd.hint")}</p>
          {positions.length === 0 ? <p className="m-0 text-muted">{t("cr.jd.noPositions")}</p> : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {positions.map((p) => {
                const d = descriptions.find((x) => x.position_id === p.id);
                const n = lines(d?.duties ?? null);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <b className="block break-words font-semibold">{pick(locale, p.name, p.name_local)}</b>
                      <span className="text-sm text-muted">{d?.summary ? d.summary : t("cr.jd.none")}</span>
                    </div>
                    {n > 0 && <Badge tone="neutral">{f("cr.jd.count", { n })}</Badge>}
                    <Button aria-label={t("common.edit")} className="w-11 px-0" onClick={() => editJd(p)}><Pencil className="size-4" aria-hidden /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-history" aria-labelledby="tab-history">
          <div className="flex justify-end">
            {active.length > 0 && positions.length > 0 && <Button variant="primary" onClick={newPr}><Plus className="size-[18px]" aria-hidden />{t("cr.pr.add")}</Button>}
          </div>
          {events.length === 0 ? (
            <div className="rounded-card border border-line bg-surface px-4 py-9 text-center"><b className="block">{t("cr.pr.empty")}</b><span className="text-muted">{t("cr.pr.emptyBody")}</span></div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {events.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block break-words font-semibold">{nameOf(e.employee_id)}</b>
                    <span className="text-sm text-muted">{f("cr.pr.line", { from: e.from_name ? pick(locale, e.from_name, e.from_name_local) : t("cr.pr.noFrom"), to: pick(locale, e.to_name, e.to_name_local) })}</span>
                    {e.note && <span className="block text-sm text-muted">{e.note}</span>}
                  </div>
                  <Badge tone={e.kind === "promotion" ? "success" : "neutral"}>{t(e.kind === "promotion" ? "cr.pr.kind.promotion" : "cr.pr.kind.transfer")}</Badge>
                  <span className="text-sm text-muted">{date(e.event_date)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <SidePanel open={jd !== null} onClose={() => setJd(null)} closeLabel={t("common.close")}
        title={jd ? f("cr.jd.title", { name: pick(locale, jd.position.name, jd.position.name_local) }) : ""}
        footer={<><Button onClick={() => setJd(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={saveJd}>{t("cr.jd.save")}</Button></>}>
        {jd && (
          <div className="flex flex-col gap-4">
            <Textarea label={t("cr.jd.summary")} rows={3} maxLength={2000} value={jd.summary} onChange={(e) => setJd({ ...jd, summary: e.target.value })} />
            <Textarea label={t("cr.jd.summaryLocal")} rows={3} maxLength={2000} value={jd.summaryLocal} onChange={(e) => setJd({ ...jd, summaryLocal: e.target.value })} />
            <Textarea label={t("cr.jd.duties")} rows={7} maxLength={6000} value={jd.duties} onChange={(e) => setJd({ ...jd, duties: e.target.value })} />
            <Textarea label={t("cr.jd.dutiesLocal")} rows={7} maxLength={6000} value={jd.dutiesLocal} onChange={(e) => setJd({ ...jd, dutiesLocal: e.target.value })} />
            {error && <p role="alert" className="m-0 text-[14px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>

      <SidePanel open={pr !== null} onClose={() => setPr(null)} closeLabel={t("common.close")} title={t("cr.pr.title")}
        footer={<><Button onClick={() => setPr(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={savePr}>{t("cr.pr.save")}</Button></>}>
        {pr && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-muted">{t("cr.pr.hint")}</p>
            <Select label={t("cr.pr.employee")} value={pr.employee} onChange={(e) => { setPr({ ...pr, employee: e.target.value }); setError(undefined); }}>
              {active.map((p) => <option key={p.id} value={p.id}>{pick(locale, p.name, p.name_local)}</option>)}
            </Select>
            <Select label={t("cr.pr.kind")} value={pr.kind} onChange={(e) => setPr({ ...pr, kind: e.target.value as PrDraft["kind"] })}>
              <option value="promotion">{t("cr.pr.kind.promotion")}</option>
              <option value="transfer">{t("cr.pr.kind.transfer")}</option>
            </Select>
            <Select label={t("cr.pr.position")} value={pr.position} onChange={(e) => { setPr({ ...pr, position: e.target.value }); setError(undefined); }}>
              <option value="" disabled />
              {positions.map((p) => <option key={p.id} value={p.id}>{pick(locale, p.name, p.name_local)}</option>)}
            </Select>
            <Input label={t("cr.pr.date")} type="date" max={today()} value={pr.date} onChange={(e) => { setPr({ ...pr, date: e.target.value }); setError(undefined); }} />
            <Textarea label={t("cr.pr.note")} rows={3} maxLength={1000} value={pr.note} onChange={(e) => setPr({ ...pr, note: e.target.value })} />
            {error && <p role="alert" className="m-0 text-[14px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
