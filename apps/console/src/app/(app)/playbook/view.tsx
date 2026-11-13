"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, RichEditor, RichText, SidePanel, Toggle, resizeImage, richPlainText, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

export interface StepDraftData {
  title: string; title_local: string; skip_if: boolean; skip_condition: string; skip_condition_local: string; body: string; body_local: string; image_path: string | null;
}
interface Person { employee_id: string; name: string; name_local: string | null; done_at: string | null }
export interface PositionOption { id: string; name: string; name_local: string | null }
export interface GuideRow {
  id: string; title: string; title_local: string | null; topic: string | null; read_minutes: number | null; archived: boolean;
  steps: StepDraftData[]; position_ids: string[]; people: Person[];
}
interface Step extends StepDraftData { key: string }
interface Draft { id: string | null; title: string; titleLocal: string; topic: string; minutes: string; positionIds: string[]; steps: Step[]; originalImages: string[] }

const BUCKET = "playbook-images";
let seq = 0;
const newKey = () => `s${Date.now()}-${seq++}`;
const blankStep = (): Step => ({ key: newKey(), title: "", title_local: "", skip_if: false, skip_condition: "", skip_condition_local: "", body: "", body_local: "", image_path: null });

/** A step picture, opened through a short-lived signed address because the bucket is private. */
function Pic({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    void createClient().storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (live) setUrl(data?.signedUrl); });
    return () => { live = false; };
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className={className} /> : <div className={className} aria-hidden />;
}

export function PlaybookView({ rows, positions, companyId }: { rows: GuideRow[]; positions: PositionOption[]; companyId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<GuideRow | null>(null);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));
  const labels = { bold: t("rte.bold"), italic: t("rte.italic"), underline: t("rte.underline"), heading: t("rte.heading"), bullets: t("rte.bullets"), numbers: t("rte.numbers"), link: t("rte.link"), linkUrl: t("rte.linkUrl"), linkApply: t("rte.linkApply") };

  const shown = rows.filter((r) => showArchived || !r.archived);
  const hasArchived = rows.some((r) => r.archived);

  function edit(r: GuideRow | "new") {
    setError(undefined);
    setDraft(r === "new"
      ? { id: null, title: "", titleLocal: "", topic: "", minutes: "", positionIds: [], steps: [blankStep()], originalImages: [] }
      : { id: r.id, title: r.title, titleLocal: r.title_local ?? "", topic: r.topic ?? "", minutes: r.read_minutes ? String(r.read_minutes) : "", positionIds: r.position_ids,
          steps: r.steps.map((s) => ({ ...s, key: newKey() })), originalImages: r.steps.map((s) => s.image_path).filter((p): p is string => !!p) });
  }
  const setStep = (key: string, patch: Partial<Step>) => setDraft((d) => d && { ...d, steps: d.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const move = (i: number, by: number) => setDraft((d) => {
    if (!d) return d;
    const j = i + by;
    if (j < 0 || j >= d.steps.length) return d;
    const steps = d.steps.slice();
    [steps[i], steps[j]] = [steps[j], steps[i]];
    return { ...d, steps };
  });

  async function upload(key: string, file: File) {
    const sb = createClient();
    try {
      const blob = await resizeImage(file, 1280, 0.82);
      const path = `${companyId}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const prev = draft?.steps.find((s) => s.key === key)?.image_path;
      // A picture added in this session and replaced again is not needed any more; a saved one is removed after saving.
      if (prev && !draft?.originalImages.includes(prev)) void sb.storage.from(BUCKET).remove([prev]);
      setStep(key, { image_path: path });
    } catch {
      setError(t("pb.err.upload"));
    }
  }
  function dropImage(s: Step) {
    if (s.image_path && !draft?.originalImages.includes(s.image_path)) void createClient().storage.from(BUCKET).remove([s.image_path]);
    setStep(s.key, { image_path: null });
  }

  async function save() {
    if (!draft) return;
    const minutes = draft.minutes.trim() ? Number(draft.minutes) : null;
    const valid = draft.title.trim() && draft.steps.length >= 1 && draft.steps.every((s) => s.title.trim() && (!s.skip_if || s.skip_condition.trim()))
      && (minutes === null || (Number.isInteger(minutes) && minutes >= 1 && minutes <= 120));
    if (!valid) return setError(t("pb.err.invalid"));
    setBusy(true);
    const sb = createClient();
    const { error: err } = await sb.rpc("save_playbook", {
      p_id: draft.id, p_title: draft.title.trim(), p_title_local: draft.titleLocal.trim() || null, p_topic: draft.topic.trim() || null,
      p_read_minutes: minutes, p_position_ids: draft.positionIds.length ? draft.positionIds : null,
      p_steps: draft.steps.map((s) => ({
        title: s.title.trim(), title_local: s.title_local.trim() || null, skip_if: s.skip_if,
        skip_condition: s.skip_if ? s.skip_condition.trim() : null, skip_condition_local: s.skip_if && s.skip_condition_local.trim() ? s.skip_condition_local.trim() : null,
        body: richPlainText(s.body) ? s.body : "", body_local: richPlainText(s.body_local) ? s.body_local : null, image_path: s.image_path,
      })),
    });
    setBusy(false);
    if (err) return setError(t(err.code === "42501" ? "common.forbidden" : err.code === "22023" || err.code === "23514" ? "pb.err.invalid" : "common.saveError"));
    // Pictures the guide no longer uses are deleted from storage.
    const kept = new Set(draft.steps.map((s) => s.image_path));
    const gone = draft.originalImages.filter((p) => !kept.has(p));
    if (gone.length) void sb.storage.from(BUCKET).remove(gone);
    toast("success", t("pb.saved"));
    setDraft(null);
    setOpen(null);
    router.refresh();
  }

  async function archive(r: GuideRow, archived: boolean) {
    setBusy(true);
    const { error: err } = await createClient().rpc("archive_playbook", { p_id: r.id, p_archived: archived });
    setBusy(false);
    if (err) return toast("error", t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t(archived ? "pb.archivedDone" : "pb.restoredDone"));
    setOpen(null);
    router.refresh();
  }

  const posName = (id: string) => { const p = positions.find((x) => x.id === id); return p ? pick(locale, p.name, p.name_local) : ""; };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("pb.title")}</h1>
          <p className="mt-1 max-w-[66ch] text-muted">{t("pb.subtitle")}</p>
        </div>
        <Button variant="primary" className="w-full sm:w-auto" onClick={() => edit("new")}><Plus className="size-[18px]" aria-hidden />{t("pb.add")}</Button>
      </div>

      {hasArchived && <Toggle checked={showArchived} label={t("pb.showArchived")} onChange={setShowArchived} />}

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t("pb.empty")}</b>{t("pb.emptyBody")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {shown.map((r) => {
            const done = r.people.filter((p) => p.done_at).length;
            return (
              <button key={r.id} type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-start first:border-t-0 hover:bg-ground">
                <div className="min-w-0 flex-1">
                  <b className="block break-words font-semibold">{pick(locale, r.title, r.title_local)}</b>
                  <span className="text-sm text-muted">
                    {f("pb.stepsCount", { n: r.steps.length })}{r.topic ? ` · ${r.topic}` : ""} · {r.position_ids.length ? r.position_ids.map(posName).join(", ") : t("pb.everyone")}
                  </span>
                </div>
                {r.archived ? <Badge tone="neutral">{t("pb.archived")}</Badge>
                  : <Badge tone={r.people.length > 0 && done === r.people.length ? "success" : "warning"}>{f("pb.done", { done, total: r.people.length })}</Badge>}
              </button>
            );
          })}
        </div>
      )}

      <SidePanel open={open !== null} onClose={() => setOpen(null)} closeLabel={t("common.close")} title={open ? pick(locale, open.title, open.title_local) : ""}
        footer={open && <>
          <Button className="mr-auto" loading={busy} onClick={() => archive(open, !open.archived)}>
            {open.archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}{t(open.archived ? "pb.restore" : "pb.archive")}
          </Button>
          <Button variant="primary" onClick={() => edit(open)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>
        </>}>
        {open && (
          <div className="flex flex-col gap-4">
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {open.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3 rounded-card border border-line p-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-link">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block break-words">{pick(locale, s.title, s.title_local)}</b>
                    <span className="text-sm text-muted">{s.skip_if ? f("pb.skipIfShort", { c: pick(locale, s.skip_condition, s.skip_condition_local) }) : t("pb.must")}</span>
                  </span>
                </li>
              ))}
            </ol>
            <h3 className="m-0 mt-2 text-sm font-semibold">{t("pb.who")}</h3>
            {open.people.length === 0 ? <p className="m-0 text-sm text-muted">{t("pb.noPeople")}</p> : (
              <ul className="m-0 list-none overflow-hidden rounded-card border border-line p-0">
                {open.people.map((p) => (
                  <li key={p.employee_id} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm first:border-t-0">
                    <span className="min-w-0 break-words">{pick(locale, p.name, p.name_local)}</span>
                    {p.done_at
                      ? <span className="inline-flex shrink-0 items-center gap-1 text-success-ink"><Check className="size-4" aria-hidden />{fmtDate(locale, p.done_at.slice(0, 10))}</span>
                      : <span className="shrink-0 text-muted">{t("pb.notYet")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SidePanel>

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("pb.edit") : t("pb.add")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("pb.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("pb.name")} value={draft.title} maxLength={200} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(undefined); }} />
            <Input label={t("pb.nameLocal")} value={draft.titleLocal} maxLength={200} onChange={(e) => setDraft({ ...draft, titleLocal: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("pb.topic")} value={draft.topic} maxLength={40} hint={t("pb.topicHint")} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
              <Input label={t("pb.minutes")} value={draft.minutes} inputMode="numeric" maxLength={3} onChange={(e) => setDraft({ ...draft, minutes: e.target.value.replace(/\D/g, "") })} />
            </div>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-semibold text-ink-2">{t("pb.audience")}</legend>
              <label className="flex min-h-10 items-center gap-2"><input type="radio" name="aud" checked={draft.positionIds.length === 0} onChange={() => setDraft({ ...draft, positionIds: [] })} />{t("pb.audienceAll")}</label>
              <label className="flex min-h-10 items-center gap-2"><input type="radio" name="aud" checked={draft.positionIds.length > 0} disabled={positions.length === 0}
                onChange={() => setDraft({ ...draft, positionIds: positions.slice(0, 1).map((p) => p.id) })} />{t("pb.audiencePositions")}</label>
              {positions.length === 0 && <span className="text-xs text-muted">{t("pb.noPositions")}</span>}
              {draft.positionIds.length > 0 && (
                <div className="flex flex-wrap gap-2 ps-6">
                  {positions.map((p) => {
                    const on = draft.positionIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on}
                        onClick={() => setDraft({ ...draft, positionIds: on ? (draft.positionIds.length > 1 ? draft.positionIds.filter((x) => x !== p.id) : draft.positionIds) : [...draft.positionIds, p.id] })}
                        className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary-soft text-link" : "border-line-strong text-muted hover:bg-ground"}`}>
                        {pick(locale, p.name, p.name_local)}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <h3 className="m-0 mt-2 text-sm font-semibold">{t("pb.steps")}</h3>
            {draft.steps.map((s, i) => (
              <section key={s.key} className="flex flex-col gap-3 rounded-card border border-line p-3" aria-label={f("pb.step", { n: i + 1 })}>
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-link">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-semibold">{f("pb.step", { n: i + 1 })}</span>
                  <button type="button" aria-label={t("pb.moveUp")} title={t("pb.moveUp")} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-control hover:bg-ground disabled:opacity-40"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={t("pb.moveDown")} title={t("pb.moveDown")} disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-control hover:bg-ground disabled:opacity-40"><ArrowDown className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={t("pb.removeStep")} title={t("pb.removeStep")} disabled={draft.steps.length === 1}
                    onClick={() => { dropImage(s); setDraft({ ...draft, steps: draft.steps.filter((x) => x.key !== s.key) }); }} className="grid size-9 place-items-center rounded-control text-danger hover:bg-ground disabled:opacity-40"><Trash2 className="size-4" aria-hidden /></button>
                </div>
                <Input label={t("pb.stepTitle")} value={s.title} maxLength={200} onChange={(e) => { setStep(s.key, { title: e.target.value }); setError(undefined); }} />
                <Input label={t("pb.stepTitleLocal")} value={s.title_local} maxLength={200} onChange={(e) => setStep(s.key, { title_local: e.target.value })} />

                <div role="radiogroup" aria-label={t("pb.requirement")} className="flex flex-wrap gap-2">
                  {([false, true] as const).map((skip) => (
                    <button key={String(skip)} type="button" role="radio" aria-checked={s.skip_if === skip} onClick={() => setStep(s.key, { skip_if: skip })}
                      className={`min-h-10 rounded-full border px-4 font-semibold transition-colors ${s.skip_if === skip ? "border-primary bg-primary-soft text-link" : "border-line-strong text-muted hover:bg-ground"}`}>
                      {t(skip ? "pb.skipIf" : "pb.must")}
                    </button>
                  ))}
                </div>
                {s.skip_if && <>
                  <Input label={t("pb.skipCondition")} value={s.skip_condition} maxLength={300} onChange={(e) => { setStep(s.key, { skip_condition: e.target.value }); setError(undefined); }} />
                  <Input label={t("pb.skipConditionLocal")} value={s.skip_condition_local} maxLength={300} onChange={(e) => setStep(s.key, { skip_condition_local: e.target.value })} />
                </>}

                <RichEditor key={`${s.key}-b`} label={t("pb.body")} value={s.body} labels={labels} minHeight={120} onChange={(html) => setStep(s.key, { body: html })} />
                <RichEditor key={`${s.key}-l`} label={t("pb.bodyLocal")} value={s.body_local} labels={labels} minHeight={120} onChange={(html) => setStep(s.key, { body_local: html })} />

                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-ink-2">{t("pb.picture")}</span>
                  {s.image_path && <Pic path={s.image_path} className="aspect-video w-full rounded-control border border-line bg-ground object-cover" />}
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-line-strong px-3 font-semibold hover:bg-ground">
                      <ImagePlus className="size-4" aria-hidden />{t(s.image_path ? "pb.pictureReplace" : "pb.pictureAdd")}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(s.key, file); }} />
                    </label>
                    {s.image_path && <Button onClick={() => dropImage(s)}><Trash2 className="size-4" aria-hidden />{t("pb.pictureRemove")}</Button>}
                  </div>
                </div>
              </section>
            ))}
            <Button onClick={() => setDraft({ ...draft, steps: [...draft.steps, blankStep()] })}><Plus className="size-4" aria-hidden />{t("pb.addStep")}</Button>
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
