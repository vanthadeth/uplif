"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, ProgressBar, Reveal, RichText, Skeleton, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { LearnBack } from "@/components/learn-back";

interface Guide { guide_id: string; title: string; title_local: string | null; topic: string | null; read_minutes: number | null; step_count: number; done_at: string | null }
interface Step { step_position: number; title: string; title_local: string | null; skip_if: boolean; skip_condition: string | null; skip_condition_local: string | null; body: string; body_local: string | null; image_path: string | null }

/** A step picture, opened through a short-lived signed address because the bucket is private. */
function StepPic({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    void createClient().storage.from("playbook-images").createSignedUrl(path, 3600).then(({ data }) => { if (live) setUrl(data?.signedUrl); });
    return () => { live = false; };
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} loading="lazy" className="aspect-video w-full rounded-control object-cover" /> : <Skeleton className="aspect-video w-full" />;
}

/** The Playbook: guides to follow, a topic filter and your progress. */
export function PlaybookList() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Guide[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await createClient().rpc("my_playbooks");
    if (error) { setFailed(true); return; }
    setRows(data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  if (failed) return <ErrorState title={t("st.pb.loadError")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!rows) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.pb.loading")}><Skeleton className="h-8" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
  if (rows.length === 0) return <EmptyState title={t("st.pb.empty.title")} body={t("st.pb.empty.body")} />;

  const topics = [...new Set(rows.map((r) => r.topic).filter((x): x is string => !!x))];
  const shown = rows.filter((r) => !topic || r.topic === topic);
  const done = rows.filter((r) => r.done_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <span className="text-sm font-semibold text-muted">{fill(t("st.pb.progress"), { done, total: rows.length })}</span>
        <ProgressBar value={(done / rows.length) * 100} label={fill(t("st.pb.progress"), { done, total: rows.length })} tone={done === rows.length ? "success" : "primary"} />
      </div>
      {topics.length > 0 && (
        <div role="group" aria-label={t("st.pb.topics")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[null, ...topics].map((x) => (
            <button key={x ?? "all"} type="button" aria-pressed={topic === x} onClick={() => setTopic(x)}
              className={`min-h-10 shrink-0 rounded-full border px-4 font-semibold transition-colors ${topic === x ? "border-primary bg-primary-soft text-link" : "border-line-strong bg-surface text-muted"}`}>
              {x ?? t("st.pb.all")}
            </button>
          ))}
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((r, i) => (
          <li key={r.guide_id} className="animate-[uplif-in_240ms_ease-out_both]" style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
            <Link href={`/learn/playbook/${r.guide_id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-ground">
              <span className="min-w-0 flex-1">
                <b className="block break-words leading-snug">{local(r.title, r.title_local)}</b>
                <span className="text-sm text-muted">
                  {fill(t("st.pb.steps"), { n: r.step_count })}{r.read_minutes ? ` · ${fill(t("st.pb.minutes"), { n: r.read_minutes })}` : ""}{r.topic ? ` · ${r.topic}` : ""}
                </span>
              </span>
              <Badge tone={r.done_at ? "success" : "warning"}>{t(r.done_at ? "st.pb.done" : "st.pb.todo")}</Badge>
              <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One guide: its numbered steps and the "mark as done" button. */
export function GuideView({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [state, setState] = useState<"loading" | "failed" | "missing" | "ok">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    const sb = createClient();
    const [g, s] = await Promise.all([sb.rpc("my_playbooks"), sb.rpc("my_playbook_steps", { p_guide_id: id })]);
    if (s.error?.code === "P0002") { setState("missing"); return; }
    if (g.error || s.error) { setState("failed"); return; }
    const found = g.data.find((x) => x.guide_id === id) ?? null;
    if (!found) { setState("missing"); return; }
    setGuide(found); setSteps(s.data); setState("ok");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const back = <LearnBack title={guide ? local(guide.title, guide.title_local) : ""} href="/learn/playbook" label={t("st.pb.back")} />;
  if (state === "failed") return <div className="flex flex-col gap-4">{back}<ErrorState title={t("st.pb.loadError")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} /></div>;
  if (state === "missing") return <div className="flex flex-col gap-4">{back}<EmptyState title={t("st.pb.notFound")} body={t("st.pb.notFoundBody")} /></div>;
  if (state === "loading" || !guide || !steps) return <div className="flex flex-col gap-4">{back}<div className="flex flex-col gap-3" role="status" aria-label={t("st.pb.loading")}><Skeleton className="h-6 w-2/3" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div></div>;

  async function toggle(done: boolean) {
    setBusy(true);
    const { error } = await createClient().rpc("set_playbook_done", { p_guide_id: id, p_done: done });
    setBusy(false);
    if (error) { toast("error", t("st.pb.error")); return; }
    toast("success", t(done ? "st.pb.doneSaved" : "st.pb.undone"));
    setGuide({ ...guide!, done_at: done ? new Date().toISOString() : null });
  }

  return (
    <Reveal className="flex flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{fill(t("st.pb.steps"), { n: steps.length })}</span>
        {guide.read_minutes && <span>· {fill(t("st.pb.minutes"), { n: guide.read_minutes })}</span>}
        {guide.topic && <Badge tone="info">{guide.topic}</Badge>}
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map((s, i) => {
          const cond = s.skip_if ? local(s.skip_condition ?? "", s.skip_condition_local) : "";
          const body = local(s.body, s.body_local);
          return (
            <li key={s.step_position} className="flex animate-[uplif-in_240ms_ease-out_both] flex-col gap-3 rounded-card border border-line bg-surface p-4" style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}>
              <div className="flex items-start gap-3">
                <span aria-label={fill(t("st.pb.step"), { n: s.step_position })} className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-white">{s.step_position}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 break-words text-lg font-bold leading-snug">{local(s.title, s.title_local)}</h2>
                  <div className="mt-1.5">{s.skip_if ? <Badge tone="warning">{fill(t("st.pb.skipIf"), { c: cond })}</Badge> : <Badge tone="info">{t("st.pb.must")}</Badge>}</div>
                </div>
              </div>
              {s.image_path && <StepPic path={s.image_path} alt={local(s.title, s.title_local)} />}
              {body.trim() && <RichText html={body} />}
            </li>
          );
        })}
      </ol>
      {guide.done_at ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 flex items-center gap-2 rounded-card bg-success-soft p-3 font-semibold text-success-ink"><Check className="size-5" aria-hidden />{fill(t("st.pb.doneOn"), { date: new Date(guide.done_at).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" }) })}</p>
          <Button className="h-12 w-full" loading={busy} onClick={() => void toggle(false)}>{t("st.pb.undo")}</Button>
        </div>
      ) : (
        <Button variant="primary" className="h-14 w-full text-lg" loading={busy} onClick={() => void toggle(true)}>{t("st.pb.markDone")}</Button>
      )}
    </Reveal>
  );
}
