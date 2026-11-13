"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Pencil, Plus } from "lucide-react";
import { Badge, Button, Input, RichEditor, RichText, SidePanel, Tabs, Toggle, richPlainText, toRichHtml, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

interface Person { employee_id: string; name: string; name_local: string | null; acknowledged_at: string | null }
export interface PolicyRow {
  id: string; kind: "policy" | "conduct"; title: string; title_local: string | null; archived: boolean;
  version: number; body: string; body_local: string | null; published_at: string; people: Person[];
}
interface Draft { id: string | null; kind: "policy" | "conduct"; title: string; titleLocal: string; body: string; bodyLocal: string; origBody: string; origBodyLocal: string }

export function PoliciesView({ rows }: { rows: PolicyRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [kind, setKind] = useState<"policy" | "conduct">("policy");
  const [open, setOpen] = useState<PolicyRow | null>(null);
  const labels = { bold: t("rte.bold"), italic: t("rte.italic"), underline: t("rte.underline"), heading: t("rte.heading"), bullets: t("rte.bullets"), numbers: t("rte.numbers"), link: t("rte.link"), linkUrl: t("rte.linkUrl"), linkApply: t("rte.linkApply") };
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  const ofKind = rows.filter((r) => r.kind === kind);
  const shown = ofKind.filter((r) => showArchived || !r.archived);
  const hasArchived = ofKind.some((r) => r.archived);
  const conduct = kind === "conduct";

  function edit(r: PolicyRow | "new") {
    setError(undefined);
    setDraft(r === "new" ? { id: null, kind, title: "", titleLocal: "", body: "", bodyLocal: "", origBody: "", origBodyLocal: "" }
      : { id: r.id, kind: r.kind, title: r.title, titleLocal: r.title_local ?? "", body: r.body, bodyLocal: r.body_local ?? "", origBody: r.body, origBodyLocal: r.body_local ?? "" });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !richPlainText(draft.body)) return setError(t("pol.errTitle"));
    // An unchanged text keeps its stored form, so editing only the title never publishes a new version.
    const keep = (now: string, was: string) => (toRichHtml(now) === toRichHtml(was) ? was : now);
    const bodyLocal = richPlainText(draft.bodyLocal) ? keep(draft.bodyLocal, draft.origBodyLocal) : null;
    setBusy(true);
    const { error: err } = await createClient().rpc("save_policy", {
      p_id: draft.id, p_title: draft.title.trim(), p_title_local: draft.titleLocal.trim() || null,
      p_body: keep(draft.body, draft.origBody), p_body_local: bodyLocal, p_kind: draft.kind,
    });
    setBusy(false);
    if (err) return setError(t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t(draft.id ? "pol.saved" : "pol.created"));
    setDraft(null);
    setOpen(null);
    router.refresh();
  }

  async function archive(r: PolicyRow, archived: boolean) {
    setBusy(true);
    const { error: err } = await createClient().rpc("archive_policy", { p_id: r.id, p_archived: archived });
    setBusy(false);
    if (err) return toast("error", t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t(archived ? "pol.archivedDone" : "pol.restoredDone"));
    setOpen(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("pol.title")}</h1>
          <p className="mt-1 max-w-[66ch] text-muted">{t("pol.subtitle")}</p>
        </div>
        <Button variant="primary" className="w-full sm:w-auto" onClick={() => edit("new")}><Plus className="size-[18px]" aria-hidden />{t(conduct ? "pol.addConduct" : "pol.add")}</Button>
      </div>

      <Tabs label={t("pol.tabsLabel")} value={kind} onChange={(id) => setKind(id as "policy" | "conduct")}
        items={[{ id: "policy", label: t("pol.tabPolicies") }, { id: "conduct", label: t("pol.tabConduct") }]} />

      {hasArchived && <Toggle checked={showArchived} label={t("pol.showArchived")} onChange={setShowArchived} />}

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t(conduct ? "pol.emptyConduct" : "pol.empty")}</b>{t(conduct ? "pol.emptyConductBody" : "pol.emptyBody")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {shown.map((r) => {
            const done = r.people.filter((p) => p.acknowledged_at).length;
            return (
              <button key={r.id} type="button" onClick={() => setOpen(r)}
                className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-start first:border-t-0 hover:bg-ground">
                <div className="min-w-0 flex-1">
                  <b className="block break-words font-semibold">{pick(locale, r.title, r.title_local)}</b>
                  <span className="text-sm text-muted">{f("pol.version", { n: r.version })} · {f("pol.updated", { date: fmtDate(locale, r.published_at.slice(0, 10)) })}</span>
                </div>
                {r.archived ? <Badge tone="neutral">{t("pol.archived")}</Badge>
                  : <Badge tone={r.people.length > 0 && done === r.people.length ? "success" : "warning"}>{f("pol.confirmed", { done, total: r.people.length })}</Badge>}
              </button>
            );
          })}
        </div>
      )}

      <SidePanel open={open !== null} onClose={() => setOpen(null)} closeLabel={t("common.close")} title={open ? pick(locale, open.title, open.title_local) : ""}
        footer={open && <>
          <Button className="mr-auto" loading={busy} onClick={() => archive(open, !open.archived)}>
            {open.archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}{t(open.archived ? "pol.restore" : "pol.archive")}
          </Button>
          <Button variant="primary" onClick={() => edit(open)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>
        </>}>
        {open && (
          <div className="flex flex-col gap-4">
            <span className="text-sm text-muted">{f("pol.version", { n: open.version })}</span>
            <RichText html={pick(locale, open.body, open.body_local)} />
            <h3 className="m-0 mt-2 text-sm font-semibold">{t("pol.who")}</h3>
            {open.people.length === 0 ? <p className="m-0 text-sm text-muted">{t("pol.noPeople")}</p> : (
              <ul className="m-0 list-none overflow-hidden rounded-card border border-line p-0">
                {open.people.map((p) => (
                  <li key={p.employee_id} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm first:border-t-0">
                    <span className="min-w-0 break-words">{pick(locale, p.name, p.name_local)}</span>
                    {p.acknowledged_at
                      ? <span className="inline-flex shrink-0 items-center gap-1 text-success-ink"><Check className="size-4" aria-hidden />{fmtDate(locale, p.acknowledged_at.slice(0, 10))}</span>
                      : <span className="shrink-0 text-muted">{t("pol.notYet")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SidePanel>

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft ? t(draft.id ? (draft.kind === "conduct" ? "pol.editConduct" : "pol.edit") : (draft.kind === "conduct" ? "pol.addConduct" : "pol.add")) : ""}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("pol.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("pol.name")} value={draft.title} maxLength={200} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(undefined); }} />
            <Input label={t("pol.nameLocal")} value={draft.titleLocal} maxLength={200} onChange={(e) => setDraft({ ...draft, titleLocal: e.target.value })} />
            <RichEditor key={draft.id ?? "new"} label={t("pol.body")} value={draft.body} labels={labels} hint={draft.id ? t("pol.bodyHint") : undefined}
              onChange={(html) => { setDraft((d) => d && { ...d, body: html }); setError(undefined); }} />
            <RichEditor key={`${draft.id ?? "new"}-local`} label={t("pol.bodyLocal")} value={draft.bodyLocal} labels={labels}
              onChange={(html) => setDraft((d) => d && { ...d, bodyLocal: html })} />
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
