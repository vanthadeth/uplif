"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Pencil, Plus } from "lucide-react";
import { Badge, Button, Input, SidePanel, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

interface Person { employee_id: string; name: string; name_local: string | null; acknowledged_at: string | null }
export interface PolicyRow {
  id: string; title: string; title_local: string | null; archived: boolean;
  version: number; body: string; body_local: string | null; published_at: string; people: Person[];
}
interface Draft { id: string | null; title: string; titleLocal: string; body: string; bodyLocal: string }

export function PoliciesView({ rows }: { rows: PolicyRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<PolicyRow | null>(null);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  const shown = rows.filter((r) => showArchived || !r.archived);
  const hasArchived = rows.some((r) => r.archived);

  function edit(r: PolicyRow | "new") {
    setError(undefined);
    setDraft(r === "new" ? { id: null, title: "", titleLocal: "", body: "", bodyLocal: "" }
      : { id: r.id, title: r.title, titleLocal: r.title_local ?? "", body: r.body, bodyLocal: r.body_local ?? "" });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) return setError(t("pol.errTitle"));
    setBusy(true);
    const { error: err } = await createClient().rpc("save_policy", {
      p_id: draft.id, p_title: draft.title.trim(), p_title_local: draft.titleLocal.trim() || null,
      p_body: draft.body, p_body_local: draft.bodyLocal.trim() ? draft.bodyLocal : null,
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
        <Button variant="primary" className="w-full sm:w-auto" onClick={() => edit("new")}><Plus className="size-[18px]" aria-hidden />{t("pol.add")}</Button>
      </div>

      {hasArchived && <Toggle checked={showArchived} label={t("pol.showArchived")} onChange={setShowArchived} />}

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t("pol.empty")}</b>{t("pol.emptyBody")}
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
            <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">{pick(locale, open.body, open.body_local)}</p>
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

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("pol.edit") : t("pol.add")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("pol.save")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("pol.name")} value={draft.title} maxLength={200} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(undefined); }} />
            <Input label={t("pol.nameLocal")} value={draft.titleLocal} maxLength={200} onChange={(e) => setDraft({ ...draft, titleLocal: e.target.value })} />
            <Textarea label={t("pol.body")} rows={10} value={draft.body} maxLength={20000} onChange={(e) => { setDraft({ ...draft, body: e.target.value }); setError(undefined); }} hint={draft.id ? t("pol.bodyHint") : undefined} />
            <Textarea label={t("pol.bodyLocal")} rows={10} value={draft.bodyLocal} maxLength={20000} onChange={(e) => setDraft({ ...draft, bodyLocal: e.target.value })} />
            {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
