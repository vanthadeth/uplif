"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, SidePanel, Tabs, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDateTime, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

interface Option { label: string; label_local: string; correct: boolean }
interface Question { prompt: string; prompt_local: string; options: Option[] }
export interface TestRow { id: string; title: string; title_local: string | null; pass_percent: number; retake_days: number; archived: boolean; questions: Question[] }
export interface ResultRow {
  attempt_id: string; employee_id: string; name: string; name_local: string | null; test_id: string; title: string;
  score_percent: number; passed: boolean; is_retake: boolean; failed_retake: boolean; taken_at: string;
}
interface Draft { id: string | null; title: string; titleLocal: string; pass: string; retake: string; questions: Question[] }

const blankQuestion = (): Question => ({ prompt: "", prompt_local: "", options: [{ label: "", label_local: "", correct: true }, { label: "", label_local: "", correct: false }] });

export function LearnTestsView({ canManage, canRead, tests, results }: { canManage: boolean; canRead: boolean; tests: TestRow[]; results: ResultRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"tests" | "results">(canManage ? "tests" : "results");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  const edit = (r: TestRow | "new") => {
    setError(undefined);
    setDraft(r === "new" ? { id: null, title: "", titleLocal: "", pass: "80", retake: "90", questions: [blankQuestion()] }
      : { id: r.id, title: r.title, titleLocal: r.title_local ?? "", pass: String(r.pass_percent), retake: String(r.retake_days), questions: structuredClone(r.questions) });
  };
  const setQ = (qi: number, fn: (q: Question) => Question) => draft && setDraft({ ...draft, questions: draft.questions.map((q, i) => (i === qi ? fn(q) : q)) });

  async function save() {
    if (!draft) return;
    const pass = Number(draft.pass), retake = Number(draft.retake);
    const ok = draft.title.trim() && Number.isInteger(pass) && pass >= 1 && pass <= 100 && Number.isInteger(retake) && retake >= 1 && retake <= 3650
      && draft.questions.length >= 1 && draft.questions.length <= 50
      && draft.questions.every((q) => q.prompt.trim() && q.options.length >= 2 && q.options.length <= 6
        && q.options.filter((o) => o.correct).length === 1 && q.options.every((o) => o.label.trim()));
    if (!ok) { setError(t("lt.err.invalid")); return; }
    setBusy(true);
    const { error: err } = await createClient().rpc("save_learn_test", {
      p_id: draft.id, p_title: draft.title, p_title_local: draft.titleLocal || null, p_pass_percent: pass, p_retake_days: retake,
      p_questions: draft.questions.map((q) => ({ prompt: q.prompt, prompt_local: q.prompt_local, options: q.options.map((o) => ({ label: o.label, label_local: o.label_local, correct: o.correct })) })),
    });
    setBusy(false);
    if (err) { setError(t(err.code === "42501" ? "common.forbidden" : err.code === "22023" ? "lt.err.invalid" : "common.saveError")); return; }
    toast("success", t("lt.saved"));
    setDraft(null);
    router.refresh();
  }
  async function archive(r: TestRow) {
    const { error: err } = await createClient().rpc("archive_learn_test", { p_id: r.id, p_archived: !r.archived });
    if (err) { toast("error", t("common.saveError")); return; }
    router.refresh();
  }

  const shown = tests.filter((x) => showArchived || !x.archived);
  const resultRows = results.filter((r) => !onlyFailed || r.failed_retake);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("lt.title")}</h1>
        <p className="mt-1 max-w-[66ch] text-muted">{t("lt.subtitle")}</p>
      </div>
      {canManage && canRead && (
        <Tabs label={t("lt.tabs")} value={tab} onChange={(id) => setTab(id as "tests" | "results")}
          items={[{ id: "tests", label: t("lt.tab.tests") }, { id: "results", label: t("lt.tab.results") }]} />
      )}

      {tab === "tests" && canManage && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-tests" aria-labelledby="tab-tests">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Toggle checked={showArchived} label={t("lt.showArchived")} onChange={setShowArchived} />
            <Button variant="primary" onClick={() => edit("new")}><Plus className="size-[18px]" aria-hidden />{t("lt.add")}</Button>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-card border border-line bg-surface px-4 py-9 text-center">
              <b className="block">{t("lt.empty.title")}</b><span className="text-muted">{t("lt.empty.body")}</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block break-words font-semibold">{pick(locale, r.title, r.title_local)}</b>
                    <span className="text-sm text-muted">{f("lt.meta", { n: r.questions.length, p: r.pass_percent, d: r.retake_days })}</span>
                  </div>
                  {r.archived && <Badge tone="neutral">{t("lt.archived")}</Badge>}
                  <Button onClick={() => void archive(r)}>{t(r.archived ? "lt.restore" : "lt.archive")}</Button>
                  <Button aria-label={t("common.edit")} className="w-11 px-0" onClick={() => edit(r)}><Pencil className="size-4" aria-hidden /></Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "results" && canRead && (
        <section className="flex flex-col gap-3" role="tabpanel" id="panel-results" aria-labelledby="tab-results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 max-w-[66ch] text-sm text-muted">{t("lt.res.hint")}</p>
            <Toggle checked={onlyFailed} label={t("lt.res.onlyFailed")} onChange={setOnlyFailed} />
          </div>
          {resultRows.length === 0 ? (
            <div className="rounded-card border border-line bg-surface px-4 py-9 text-center">
              <b className="block">{t("lt.res.empty")}</b><span className="text-muted">{t("lt.res.emptyBody")}</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {resultRows.map((r) => (
                <div key={r.attempt_id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block break-words font-semibold">{pick(locale, r.name, r.name_local)}</b>
                    <span className="text-sm text-muted">{f("lt.res.line", { title: r.title, score: r.score_percent })} · {fmtDateTime(locale, r.taken_at)}</span>
                  </div>
                  <Badge tone={r.failed_retake ? "danger" : r.passed ? "success" : "warning"}>{t(r.failed_retake ? "lt.res.failedRetake" : r.passed ? "lt.res.passed" : "lt.res.failed")}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("lt.edit") : t("lt.add")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("lt.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("lt.name")} value={draft.title} maxLength={200} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(undefined); }} />
            <Input label={t("lt.nameLocal")} value={draft.titleLocal} maxLength={200} onChange={(e) => setDraft({ ...draft, titleLocal: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("lt.pass")} inputMode="numeric" value={draft.pass} onChange={(e) => { setDraft({ ...draft, pass: e.target.value }); setError(undefined); }} />
              <Input label={t("lt.retake")} inputMode="numeric" value={draft.retake} onChange={(e) => { setDraft({ ...draft, retake: e.target.value }); setError(undefined); }} />
            </div>
            {draft.questions.map((q, qi) => (
              <fieldset key={qi} className="m-0 flex flex-col gap-3 rounded-card border border-line p-3">
                <legend className="flex items-center gap-2 px-1 font-semibold">
                  {f("lt.q", { n: qi + 1 })}
                  {draft.questions.length > 1 && (
                    <button type="button" aria-label={t("lt.q.remove")} className="grid size-8 place-items-center rounded-control text-muted hover:bg-ground"
                      onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })}><Trash2 className="size-4" aria-hidden /></button>
                  )}
                </legend>
                <Input label={t("lt.q.text")} value={q.prompt} maxLength={1000} onChange={(e) => { setQ(qi, (x) => ({ ...x, prompt: e.target.value })); setError(undefined); }} />
                <Input label={t("lt.q.textLocal")} value={q.prompt_local} maxLength={1000} onChange={(e) => setQ(qi, (x) => ({ ...x, prompt_local: e.target.value }))} />
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-end gap-2">
                    <input type="radio" name={`right-${qi}`} aria-label={t("lt.o.correct")} checked={o.correct} className="mb-3 size-5 shrink-0"
                      onChange={() => { setQ(qi, (x) => ({ ...x, options: x.options.map((y, i) => ({ ...y, correct: i === oi })) })); setError(undefined); }} />
                    <div className="grid min-w-0 flex-1 gap-2">
                      <Input label={`${t("lt.o.text")} ${oi + 1}`} value={o.label} maxLength={500}
                        onChange={(e) => { setQ(qi, (x) => ({ ...x, options: x.options.map((y, i) => (i === oi ? { ...y, label: e.target.value } : y)) })); setError(undefined); }} />
                      <Input label={t("lt.o.textLocal")} value={o.label_local} maxLength={500}
                        onChange={(e) => setQ(qi, (x) => ({ ...x, options: x.options.map((y, i) => (i === oi ? { ...y, label_local: e.target.value } : y)) }))} />
                    </div>
                    {q.options.length > 2 && (
                      <button type="button" aria-label={t("lt.o.remove")} className="mb-2 grid size-9 shrink-0 place-items-center rounded-control text-muted hover:bg-ground"
                        onClick={() => setQ(qi, (x) => { const opts = x.options.filter((_, i) => i !== oi); if (!opts.some((y) => y.correct)) opts[0] = { ...opts[0], correct: true }; return { ...x, options: opts }; })}><Trash2 className="size-4" aria-hidden /></button>
                    )}
                  </div>
                ))}
                {q.options.length < 6 && (
                  <div><Button onClick={() => setQ(qi, (x) => ({ ...x, options: [...x.options, { label: "", label_local: "", correct: false }] }))}><Plus className="size-4" aria-hidden />{t("lt.o.add")}</Button></div>
                )}
              </fieldset>
            ))}
            {draft.questions.length < 50 && (
              <div><Button onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}><Plus className="size-4" aria-hidden />{t("lt.q.add")}</Button></div>
            )}
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
