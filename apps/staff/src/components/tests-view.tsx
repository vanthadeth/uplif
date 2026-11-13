"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, ProgressBar, Reveal, Skeleton, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface TestRow {
  test_id: string; title: string; title_local: string | null; question_count: number; pass_percent: number; retake_days: number;
  status: "new" | "failed" | "passed" | "due_soon" | "overdue"; last_score: number | null; due_on: string | null;
}
interface Question { question_id: string; prompt: string; prompt_local: string | null; options: { id: string; label: string; label_local: string | null }[] }
interface Result { score_percent: number; correct: number; total: number; passed: boolean }

const TONE = { new: "info", failed: "warning", passed: "success", due_soon: "warning", overdue: "danger" } as const;
const LABEL = { new: "st.test.new", failed: "st.test.failed", passed: "st.test.passed", due_soon: "st.test.dueSoon", overdue: "st.test.overdue" } as const;

/** Learn tests: the list, one question at a time, and the result. The server grades; the right answers never reach the phone. */
export function TestsView({ showEmpty = false }: { showEmpty?: boolean }) {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [rows, setRows] = useState<TestRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [taking, setTaking] = useState<TestRow | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await createClient().rpc("my_learn_tests");
    if (error) { setFailed(true); return; }
    setRows(data as TestRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const date = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });

  async function start(r: TestRow) {
    setBusy(true);
    const { data, error } = await createClient().rpc("learn_questions_for", { p_test_id: r.test_id });
    setBusy(false);
    if (error) { toast("error", t(error.code === "P0001" ? "st.test.notDue" : "st.test.error")); void load(); return; }
    setTaking(r); setQuestions(data as Question[]); setStep(0); setAnswers({}); setResult(null);
  }
  function close() { setTaking(null); setQuestions(null); setResult(null); void load(); }

  async function submit() {
    if (!taking) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("submit_learn_attempt", { p_test_id: taking.test_id, p_answers: answers });
    setBusy(false);
    if (error || !data?.[0]) { toast("error", t(error?.code === "P0001" ? "st.test.notDue" : "st.test.submitErr")); return; }
    setResult(data[0] as Result);
  }

  if (failed) return <ErrorState title={t("st.test.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!rows) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.test.loading")}><Skeleton className="h-16" /></div>;
  if (rows.length === 0 && !taking) return showEmpty ? <EmptyState title={t("st.learn.tests.empty.title")} body={t("st.learn.tests.empty.body")} /> : null;

  if (taking && result) {
    return (
      <Reveal className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 text-center">
        <h2 className="m-0 text-xl font-bold">{t(result.passed ? "st.test.passTitle" : "st.test.failTitle")}</h2>
        <p className="m-0 text-3xl font-bold tracking-tight">{result.score_percent}%</p>
        <ProgressBar value={result.score_percent} label={`${result.score_percent}%`} tone={result.passed ? "success" : "warning"} />
        <p className="m-0 text-muted">{fill(t("st.test.result"), { c: result.correct, t: result.total, n: result.score_percent, p: taking.pass_percent })}</p>
        {result.passed ? <Button variant="primary" className="h-14 w-full text-lg" onClick={close}>{t("st.test.done")}</Button>
          : <div className="flex flex-col gap-2">
              <Button variant="primary" className="h-14 w-full text-lg" loading={busy} onClick={() => void start(taking)}>{t("st.test.again")}</Button>
              <Button className="h-12 w-full" onClick={close}>{t("st.test.done")}</Button>
            </div>}
      </Reveal>
    );
  }

  if (taking && questions) {
    const q = questions[step];
    const last = step === questions.length - 1;
    return (
      <Reveal key={q.question_id} className="flex flex-col gap-4">
        <p className="m-0 text-sm font-semibold text-muted">{fill(t("st.test.q"), { i: step + 1, n: questions.length })}</p>
        <ProgressBar value={((step + 1) / questions.length) * 100} label={fill(t("st.test.q"), { i: step + 1, n: questions.length })} />
        <h2 className="m-0 break-words text-xl font-bold leading-snug">{local(q.prompt, q.prompt_local)}</h2>
        <div role="radiogroup" aria-label={local(q.prompt, q.prompt_local)} className="flex flex-col gap-2">
          {q.options.map((o) => {
            const on = answers[q.question_id] === o.id;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setAnswers({ ...answers, [q.question_id]: o.id })}
                className={`flex min-h-14 items-center gap-3 rounded-card border p-4 text-start transition-colors ${on ? "border-primary bg-primary-soft font-semibold" : "border-line bg-surface hover:bg-ground"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${on ? "border-primary bg-primary text-white" : "border-line"}`}>{on && <Check className="size-4" aria-hidden />}</span>
                <span className="min-w-0 break-words">{local(o.label, o.label_local)}</span>
              </button>
            );
          })}
        </div>
        <Button variant="primary" className="h-14 w-full text-lg" disabled={!answers[q.question_id]} loading={last && busy}
          onClick={() => (last ? void submit() : setStep(step + 1))}>{t(last ? "st.test.submit" : "st.test.next")}</Button>
      </Reveal>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-lg font-bold">{t("st.test.title")}</h2>
      <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0">
        {rows.map((r, i) => {
          const canTake = r.status !== "passed";
          return (
            <li key={r.test_id} className="animate-[uplif-in_240ms_ease-out_both]" style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
              <button type="button" disabled={!canTake || busy} onClick={() => void start(r)} className="flex w-full items-center gap-3 p-4 text-start enabled:hover:bg-ground">
                <span className="min-w-0 flex-1">
                  <b className="block break-words">{local(r.title, r.title_local)}</b>
                  <span className="text-sm text-muted">
                    {fill(t("st.test.meta"), { n: r.question_count, p: r.pass_percent })}
                    {r.last_score != null && ` · ${fill(t("st.test.last"), { n: r.last_score })}`}
                    {r.due_on && r.status !== "failed" && ` · ${fill(t("st.test.due"), { date: date(r.due_on) })}`}
                  </span>
                </span>
                <Badge tone={TONE[r.status]}>{t(LABEL[r.status])}</Badge>
                {canTake && <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
