"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge, Button, Input, Select, SidePanel, Skeleton, Tabs, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pick } from "@/lib/format";
import { languageOf } from "@/lib/languages";
import type { MessageKey } from "@/lib/messages";

export interface KpiRow { id: string; position_id: string; name: string; name_local: string | null; weight: number; active: boolean }
export interface PositionRow { id: string; name: string; name_local: string | null }
interface Person { employee_id: string; name: string; name_local: string | null; position_name: string | null; position_name_local: string | null; kpi_count: number; overall_percent: number | null }
interface FormRow { kpi_id: string; name: string; name_local: string | null; weight: number; score: number | null; comment: string | null }
interface KpiDraft { id: string | null; position: string; name: string; nameLocal: string; weight: string; active: boolean }

const firstOfMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

export function PerformanceView({ canReview, canManage, kpis, positions }: { canReview: boolean; canManage: boolean; kpis: KpiRow[]; positions: PositionRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"reviews" | "kpis">(canReview ? "reviews" : "kpis");
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  // ----- reviews -----
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return firstOfMonth(d); });
  const [month, setMonth] = useState(months[0]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [scoring, setScoring] = useState<{ person: Person; rows: FormRow[] } | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const monthName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(languageOf(locale).dateTag, { month: "long", year: "numeric" });

  const loadPeople = useCallback(async () => {
    if (!canReview) return;
    setPeople(null);
    const { data } = await createClient().rpc("performance_review_list", { p_period: month });
    setPeople((data ?? []) as Person[]);
  }, [canReview, month]);
  useEffect(() => { void loadPeople(); }, [loadPeople]);

  async function openScore(p: Person) {
    setError(undefined);
    const { data, error: err } = await createClient().rpc("performance_review_form", { p_employee_id: p.employee_id, p_period: month });
    if (err) { toast("error", t("common.saveError")); return; }
    const rows = (data ?? []) as FormRow[];
    setVals(Object.fromEntries(rows.map((r) => [r.kpi_id, r.score == null ? "" : String(r.score)])));
    setComment(rows[0]?.comment ?? "");
    setScoring({ person: p, rows });
  }
  async function saveScore() {
    if (!scoring) return;
    const scores: Record<string, number> = {};
    for (const r of scoring.rows) {
      const raw = (vals[r.kpi_id] ?? "").trim();
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || n < 0 || n > 100) { setError(t("pf.rev.err")); return; }
      scores[r.kpi_id] = Math.round(n);
    }
    setBusy(true);
    const { data, error: err } = await createClient().rpc("submit_performance_review", { p_employee_id: scoring.person.employee_id, p_period: month, p_scores: scores, p_comment: comment.trim() || null });
    setBusy(false);
    if (err) { setError(t(err.code === "42501" ? "common.forbidden" : err.code === "22023" ? "pf.rev.err" : "common.saveError")); return; }
    toast("success", f("pf.rev.saved", { n: data as number }));
    setScoring(null);
    void loadPeople();
  }

  // ----- KPIs -----
  const [draft, setDraft] = useState<KpiDraft | null>(null);
  const editKpi = (r: KpiRow | "new") => {
    setError(undefined);
    setDraft(r === "new" ? { id: null, position: positions[0]?.id ?? "", name: "", nameLocal: "", weight: "1", active: true }
      : { id: r.id, position: r.position_id, name: r.name, nameLocal: r.name_local ?? "", weight: String(r.weight), active: r.active });
  };
  async function saveKpi() {
    if (!draft) return;
    const w = Number(draft.weight);
    if (!draft.position || !draft.name.trim() || !Number.isInteger(w) || w < 1 || w > 100) { setError(t("pf.kpi.err")); return; }
    setBusy(true);
    const { error: err } = await createClient().rpc("save_kpi", { p_id: draft.id, p_position_id: draft.position, p_name: draft.name, p_name_local: draft.nameLocal || null, p_weight: w, p_active: draft.active });
    setBusy(false);
    if (err) { setError(t(err.code === "42501" ? "common.forbidden" : "common.saveError")); return; }
    toast("success", t("pf.kpi.saved"));
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pf.title")}</h1>
        <p className="mt-1 max-w-[66ch] text-muted">{t("pf.subtitle")}</p>
      </div>
      {canReview && canManage && (
        <Tabs label={t("pf.tabs")} value={tab} onChange={(id) => setTab(id as "reviews" | "kpis")}
          items={[{ id: "reviews", label: t("pf.tab.reviews") }, { id: "kpis", label: t("pf.tab.kpis") }]} />
      )}

      {tab === "reviews" && canReview && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews">
          <div className="max-w-xs">
            <Select label={t("pf.month")} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </Select>
          </div>
          {!people ? <Skeleton className="h-40" /> : people.length === 0 ? (
            <div className="rounded-card border border-line bg-surface px-4 py-9 text-center"><b className="block">{t("pf.rev.empty")}</b><span className="text-muted">{t("pf.rev.emptyBody")}</span></div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {people.map((p) => (
                <div key={p.employee_id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block break-words font-semibold">{pick(locale, p.name, p.name_local)}</b>
                    <span className="text-sm text-muted">{p.position_name ? pick(locale, p.position_name, p.position_name_local) : t("pf.rev.noPosition")}</span>
                  </div>
                  {p.kpi_count === 0 ? <Badge tone="neutral">{t("pf.rev.noKpi")}</Badge>
                    : <><Badge tone={p.overall_percent == null ? "warning" : "success"}>{p.overall_percent == null ? t("pf.rev.notYet") : f("pf.rev.score", { n: p.overall_percent })}</Badge>
                      <Button variant={p.overall_percent == null ? "primary" : "secondary"} onClick={() => void openScore(p)}>{t(p.overall_percent == null ? "pf.rev.score.btn" : "pf.rev.edit")}</Button></>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "kpis" && canManage && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-kpis" aria-labelledby="tab-kpis">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="m-0 max-w-[66ch] text-sm text-muted">{t("pf.kpi.hint")}</p>
            {positions.length > 0 && <Button variant="primary" onClick={() => editKpi("new")}><Plus className="size-[18px]" aria-hidden />{t("pf.kpi.add")}</Button>}
          </div>
          {positions.length === 0 ? <p className="m-0 text-muted">{t("pf.kpi.noPositions")}</p>
            : kpis.length === 0 ? (
              <div className="rounded-card border border-line bg-surface px-4 py-9 text-center"><b className="block">{t("pf.kpi.empty")}</b><span className="text-muted">{t("pf.kpi.emptyBody")}</span></div>
            ) : positions.filter((p) => kpis.some((k) => k.position_id === p.id)).map((p) => (
              <div key={p.id} className="overflow-hidden rounded-card border border-line bg-surface">
                <h2 className="m-0 border-b border-line bg-ground px-4 py-2 text-sm font-semibold">{pick(locale, p.name, p.name_local)}</h2>
                {kpis.filter((k) => k.position_id === p.id).map((k) => (
                  <div key={k.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <b className="block break-words font-semibold">{pick(locale, k.name, k.name_local)}</b>
                      <span className="text-sm text-muted">{f("pf.kpi.weightLine", { n: k.weight })}</span>
                    </div>
                    {!k.active && <Badge tone="neutral">{t("pf.kpi.retired")}</Badge>}
                    <Button aria-label={t("common.edit")} className="w-11 px-0" onClick={() => editKpi(k)}><Pencil className="size-4" aria-hidden /></Button>
                  </div>
                ))}
              </div>
            ))}
        </section>
      )}

      <SidePanel open={scoring !== null} onClose={() => setScoring(null)} closeLabel={t("common.close")}
        title={scoring ? f("pf.rev.title", { name: pick(locale, scoring.person.name, scoring.person.name_local) }) : ""}
        footer={<><Button onClick={() => setScoring(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={saveScore}>{t("pf.rev.save")}</Button></>}>
        {scoring && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-muted">{monthName(month)}. {t("pf.rev.hint")}</p>
            {scoring.rows.map((r) => (
              <Input key={r.kpi_id} label={f("pf.rev.kpiLine", { name: pick(locale, r.name, r.name_local), w: r.weight })} inputMode="numeric" maxLength={3}
                value={vals[r.kpi_id] ?? ""} onChange={(e) => { setVals({ ...vals, [r.kpi_id]: e.target.value }); setError(undefined); }} />
            ))}
            <Textarea label={t("pf.rev.comment")} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("pf.kpi.edit") : t("pf.kpi.add")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={saveKpi}>{t("pf.kpi.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Select label={t("pf.kpi.position")} value={draft.position} disabled={draft.id !== null} onChange={(e) => setDraft({ ...draft, position: e.target.value })}>
              {positions.map((p) => <option key={p.id} value={p.id}>{pick(locale, p.name, p.name_local)}</option>)}
            </Select>
            <Input label={t("pf.kpi.name")} value={draft.name} maxLength={120} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(undefined); }} />
            <Input label={t("pf.kpi.nameLocal")} value={draft.nameLocal} maxLength={120} onChange={(e) => setDraft({ ...draft, nameLocal: e.target.value })} />
            <Input label={t("pf.kpi.weight")} inputMode="numeric" value={draft.weight} onChange={(e) => { setDraft({ ...draft, weight: e.target.value }); setError(undefined); }} />
            <Toggle checked={draft.active} label={t("pf.kpi.active")} onChange={(v) => setDraft({ ...draft, active: v })} />
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
