"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Layers, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, PictureField, Select, SidePanel, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";
import { removePicture, usePicture } from "@/lib/use-picture";

export interface Category { id: string; parent_id: string | null; name: string; name_local: string | null; image_path: string | null; image_url: string | null; is_active: boolean }

/** What the form is doing: a new category (maybe already inside a chosen one) or an existing one. */
type Editing = { kind: "new"; parentId: string | null } | { kind: "edit"; category: Category };

/** Categories with one level of sub-categories: search, add, edit (picture, move), hide and delete. */
export function CategoriesView({ categories, failed, companyId, canManage }: { categories: Category[]; failed: boolean; companyId: string; canManage: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [parentId, setParentId] = useState("");
  const [active, setActive] = useState(true);
  const [nameError, setNameError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const picture = usePicture(companyId, "categories");

  const tops = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subsOf = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c]);
    return m;
  }, [categories]);
  const label = (c: Category) => pick(locale, c.name, c.name_local);

  // A main category matches when it or any of its sub-categories matches; it then shows all its sub-categories.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (c: Category) => `${c.name} ${c.name_local ?? ""}`.toLowerCase().includes(q);
    return tops.filter((c) => !q || hit(c) || (subsOf.get(c.id) ?? []).some(hit));
  }, [tops, subsOf, query]);

  const current = editing?.kind === "edit" ? editing.category : null;
  const hasSubs = !!current && (subsOf.get(current.id)?.length ?? 0) > 0;
  const isSub = parentId !== "";

  function open(e: Editing) {
    setEditing(e);
    const c = e.kind === "edit" ? e.category : null;
    setName(c?.name ?? "");
    setNameLocal(c?.name_local ?? "");
    setParentId(c ? c.parent_id ?? "" : e.kind === "new" ? e.parentId ?? "" : "");
    setActive(c?.is_active ?? true);
    picture.reset(c?.image_path ?? null, c?.image_url ?? null);
    setNameError(undefined);
  }
  function close() { void picture.discard(); setEditing(null); }

  async function save() {
    if (!name.trim()) return setNameError(t("sk.cat.nameRequired"));
    setBusy(true);
    const supabase = createClient();
    const base = { name: name.trim(), name_local: nameLocal.trim() || null, image_path: picture.path, parent_id: parentId || null };
    const res = current
      ? await supabase.from("categories").update({ ...base, is_active: active }).eq("id", current.id).select("id")
      : await supabase.from("categories").insert({ company_id: companyId, ...base }).select("id");
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "23505" ? t("sk.cat.dup") : res.error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    if (current?.image_path && current.image_path !== picture.path) await removePicture(current.image_path);
    picture.keep();
    toast("success", current ? t("sk.cat.saved") : t("sk.cat.added"));
    setEditing(null);
    router.refresh();
  }

  async function remove(c: Category) {
    setBusy(true);
    const { data, error } = await createClient().from("categories").delete().eq("id", c.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "23503" ? t("sk.cat.hasSubsDelete") : error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    await removePicture(c.image_path);
    setRemoving(null);
    toast("success", t("sk.cat.deleted"));
    router.refresh();
  }

  const tile = (c: Category, small?: boolean) => (
    c.image_url ? <img src={c.image_url} alt="" className={`${small ? "size-10" : "size-14"} shrink-0 rounded-control object-cover`} />
      : <span className={`grid ${small ? "size-10" : "size-14"} shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink`}><Layers className={small ? "size-5" : "size-6"} aria-hidden /></span>
  );
  const actions = (c: Category) => canManage && (
    <div className="flex shrink-0 gap-1">
      <button type="button" aria-label={`${t("sk.edit")}: ${c.name}`} onClick={() => open({ kind: "edit", category: c })} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
      <button type="button" aria-label={`${t("sk.delete")}: ${c.name}`} onClick={() => setRemoving(c)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
    </div>
  );
  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open({ kind: "new", parentId: null })}><Plus className="size-[18px]" aria-hidden />{t("sk.cat.add")}</Button>;

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.cat.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.cat.subtitle")}</p>
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.cat.roTitle")}</b>{t("sk.cat.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.cat.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : categories.length === 0 ? (
        <EmptyState title={t("sk.cat.empty")} body={t("sk.cat.emptyBody")} action={canManage ? add : undefined} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.search")} aria-label={t("sk.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {canManage ? <Button variant="primary" onClick={() => open({ kind: "new", parentId: null })} aria-label={t("sk.cat.add")}><Plus className="size-5" aria-hidden /></Button>
              : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("sk.brands.viewOnly")}</Badge>}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("sk.cat.noMatch")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((c) => {
                const subs = subsOf.get(c.id) ?? [];
                return (
                  <li key={c.id} className="overflow-hidden rounded-card border border-line bg-surface">
                    <div className="flex min-h-20 items-center gap-3 p-3">
                      {tile(c)}
                      <div className="min-w-0 flex-1 leading-snug">
                        <b className="block break-words">{label(c)}</b>
                        {c.name_local && <small className="block break-words text-muted">{locale === "en" ? c.name_local : c.name}</small>}
                        <small className="block text-muted">{fill(t("sk.cat.subCount"), { n: subs.length })}</small>
                        {!c.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                      </div>
                      {actions(c)}
                    </div>
                    {subs.map((s) => (
                      <div key={s.id} className="flex min-h-16 items-center gap-3 border-t border-line bg-ground/40 py-2 ps-6 pe-3">
                        {tile(s, true)}
                        <div className="min-w-0 flex-1 leading-snug">
                          <b className="block break-words">{label(s)}</b>
                          {s.name_local && <small className="block break-words text-muted">{locale === "en" ? s.name_local : s.name}</small>}
                          {!s.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                        </div>
                        {actions(s)}
                      </div>
                    ))}
                    {canManage && (
                      <button type="button" onClick={() => open({ kind: "new", parentId: c.id })}
                        className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-start font-semibold text-link transition-colors hover:bg-primary-soft">
                        <Plus className="size-4" aria-hidden />{t("sk.cat.addSub")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <SidePanel sheet open={editing !== null} onClose={close} closeLabel={t("sk.close")}
        title={current ? t(current.parent_id ? "sk.cat.editSub" : "sk.cat.edit") : t(isSub ? "sk.cat.addSub" : "sk.cat.add")}
        footer={<><Button onClick={close}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} disabled={picture.uploading} onClick={save}>{t("sk.save")}</Button></>}>
        <div className="flex flex-col gap-5">
          <PictureField label={t("sk.brands.picture")} hint={t("sk.brands.pictureHelp")} error={picture.failed ? t("sk.brands.pictureError") : undefined} src={picture.preview} busy={picture.uploading}
            addLabel={t("sk.brands.addPicture")} changeLabel={t("sk.brands.changePicture")} removeLabel={t("sk.brands.removePicture")}
            onPick={picture.pick} onRemove={picture.remove} />
          <Input label={t(isSub ? "sk.cat.subName" : "sk.cat.name")} value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} error={nameError} />
          <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={nameLocal} maxLength={120} onChange={(e) => setNameLocal(e.target.value)} />
          <Select label={t("sk.cat.inside")} hint={hasSubs ? t("sk.cat.hasSubs") : t("sk.cat.insideHint")} value={parentId} disabled={hasSubs} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("sk.cat.topLevel")}</option>
            {tops.filter((c) => c.id !== current?.id).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
          </Select>
          {current && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.cat.activeHint")}</small></div>
              <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
            </div>
          )}
        </div>
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.cat.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} disabled={!!removing && (subsOf.get(removing.id)?.length ?? 0) > 0} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? ((subsOf.get(removing.id)?.length ?? 0) > 0 ? t("sk.cat.hasSubsDelete") : fill(t("sk.cat.deleteBody"), { name: label(removing) })) : ""}</p>
      </Modal>
    </main>
  );
}
