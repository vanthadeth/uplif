"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, PictureField, SidePanel, Toggle, resizeImage, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";

export interface Brand { id: string; name: string; name_local: string | null; image_path: string | null; image_url: string | null; is_active: boolean }

const BUCKET = "stock-images";

/** The brand list: search, add, edit (with picture), hide and delete. People without the manage permission only look. */
export function BrandsView({ brands, failed, companyId, canManage }: { brands: Brand[]; failed: boolean; companyId: string; canManage: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Brand | "new" | null>(null);
  const [removing, setRemoving] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [active, setActive] = useState(true);
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // A picture uploaded in this form but not saved yet; removed again if the form is cancelled.
  const fresh = useRef<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter((b) => !q || `${b.name} ${b.name_local ?? ""}`.toLowerCase().includes(q));
  }, [brands, query]);

  function open(b: Brand | "new") {
    setEditing(b);
    setName(b === "new" ? "" : b.name);
    setNameLocal(b === "new" ? "" : b.name_local ?? "");
    setActive(b === "new" ? true : b.is_active);
    setPath(b === "new" ? null : b.image_path);
    setPreview(b === "new" ? null : b.image_url);
    setPictureError(undefined);
    setNameError(undefined);
    fresh.current = null;
  }

  async function discardFresh() {
    const p = fresh.current;
    fresh.current = null;
    if (p) await createClient().storage.from(BUCKET).remove([p]);
  }
  function close() { void discardFresh(); setEditing(null); }

  async function pick_(file: File) {
    setUploading(true);
    setPictureError(undefined);
    try {
      const blob = await resizeImage(file, 512, 0.85);
      const supabase = createClient();
      const next = `${companyId}/brands/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(next, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      await discardFresh();
      fresh.current = next;
      setPath(next);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setPictureError(t("sk.brands.pictureError"));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim()) return setNameError(t("sk.brands.nameRequired"));
    setBusy(true);
    const supabase = createClient();
    const values = { name: name.trim(), name_local: nameLocal.trim() || null, image_path: path, is_active: active };
    const res = editing === "new"
      ? await supabase.from("brands").insert({ company_id: companyId, name: values.name, name_local: values.name_local, image_path: values.image_path }).select("id")
      : await supabase.from("brands").update(values).eq("id", (editing as Brand).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "23505" ? t("sk.brands.dup") : res.error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    // The old picture is no longer used once the new one is saved.
    const old = editing !== "new" ? (editing as Brand).image_path : null;
    if (old && old !== path) await supabase.storage.from(BUCKET).remove([old]);
    fresh.current = null;
    toast("success", editing === "new" ? t("sk.brands.added") : t("sk.brands.saved"));
    setEditing(null);
    router.refresh();
  }

  async function remove(b: Brand) {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("brands").delete().eq("id", b.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    if (b.image_path) await supabase.storage.from(BUCKET).remove([b.image_path]);
    setRemoving(null);
    toast("success", t("sk.brands.deleted"));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.brands.add")}</Button>;

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.brands.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.brands.subtitle")}</p>
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.brands.roTitle")}</b>{t("sk.brands.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.brands.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : brands.length === 0 ? (
        <EmptyState title={t("sk.brands.empty")} body={t("sk.brands.emptyBody")} action={canManage ? add : undefined} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.search")} aria-label={t("sk.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {canManage ? <Button variant="primary" onClick={() => open("new")} aria-label={t("sk.brands.add")}><Plus className="size-5" aria-hidden /></Button>
              : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("sk.brands.viewOnly")}</Badge>}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("sk.brands.noMatch")}</p>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((b) => (
                <li key={b.id} className="flex min-h-20 items-center gap-3 border-t border-line p-3 first:border-t-0">
                  {b.image_url ? <img src={b.image_url} alt="" className="size-14 shrink-0 rounded-control object-cover" />
                    : <span className="grid size-14 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><Tag className="size-6" aria-hidden /></span>}
                  <div className="min-w-0 flex-1 leading-snug">
                    <b className="block break-words">{pick(locale, b.name, b.name_local)}</b>
                    {b.name_local && <small className="block break-words text-muted">{locale === "en" ? b.name_local : b.name}</small>}
                    {!b.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`${t("sk.edit")}: ${b.name}`} onClick={() => open(b)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
                      <button type="button" aria-label={`${t("sk.delete")}: ${b.name}`} onClick={() => setRemoving(b)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <SidePanel sheet open={editing !== null} onClose={close} closeLabel={t("sk.close")} title={editing === "new" ? t("sk.brands.add") : t("sk.brands.edit")}
        footer={<><Button onClick={close}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} disabled={uploading} onClick={save}>{t("sk.save")}</Button></>}>
        <div className="flex flex-col gap-5">
          <PictureField label={t("sk.brands.picture")} hint={t("sk.brands.pictureHelp")} error={pictureError} src={preview} busy={uploading}
            addLabel={t("sk.brands.addPicture")} changeLabel={t("sk.brands.changePicture")} removeLabel={t("sk.brands.removePicture")}
            onPick={pick_} onRemove={() => { void discardFresh(); setPath(null); setPreview(null); }} />
          <Input label={t("sk.brands.name")} value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} error={nameError} />
          <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={nameLocal} maxLength={120} onChange={(e) => setNameLocal(e.target.value)} />
          {editing !== "new" && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.brands.activeHint")}</small></div>
              <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
            </div>
          )}
        </div>
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.brands.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? fill(t("sk.brands.deleteBody"), { name: pick(locale, removing.name, removing.name_local) }) : ""}</p>
      </Modal>
    </main>
  );
}
