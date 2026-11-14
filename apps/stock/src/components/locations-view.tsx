"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, SidePanel, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";

export interface Location {
  id: string; name: string; name_local: string | null; address: string | null; note: string | null; is_active: boolean; branch_id: string | null;
}
interface Branch { id: string; name: string; name_local: string | null }

const blank = { name: "", name_local: "", address: "", note: "" };

/** The location list: search, add, edit, hide and delete. */
export function LocationsView({ locations, branches, failed, companyId, canManage }: { locations: Location[]; branches: Branch[]; failed: boolean; companyId: string; canManage: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [removing, setRemoving] = useState<Location | null>(null);
  const [form, setForm] = useState(blank);
  const [active, setActive] = useState(true);
  const [branch, setBranch] = useState("");
  const branchName = (id: string | null) => { const b = branches.find((x) => x.id === id); return b ? pick(locale, b.name, b.name_local) : ""; };
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors({}); };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((s) => !q || [s.name, s.name_local, s.address].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [locations, query]);

  function open(s: Location | "new") {
    setEditing(s);
    setForm(s === "new" ? blank : {
      name: s.name, name_local: s.name_local ?? "", address: s.address ?? "", note: s.note ?? "",
    });
    setActive(s === "new" ? true : s.is_active);
    setBranch(s === "new" ? "" : s.branch_id ?? "");
    setErrors({});
  }

  async function save() {
    if (!form.name.trim()) return setErrors({ name: t("sk.loc.nameRequired") });
    setBusy(true);
    const values = {
      name: form.name.trim(), name_local: form.name_local.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null, branch_id: branch || null,
    };
    const supabase = createClient();
    const res = editing === "new"
      ? await supabase.from("locations").insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from("locations").update({ ...values, is_active: active }).eq("id", (editing as Location).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "23505" ? t("sk.loc.dup") : res.error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    toast("success", editing === "new" ? t("sk.loc.added") : t("sk.loc.saved"));
    setEditing(null);
    router.refresh();
  }

  async function remove(s: Location) {
    setBusy(true);
    const { data, error } = await createClient().from("locations").delete().eq("id", s.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : error.code === "23503" ? t("sk.inuse") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    setRemoving(null);
    toast("success", t("sk.loc.deleted"));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.loc.add")}</Button>;

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.loc.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.loc.subtitle")}</p>
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.loc.roTitle")}</b>{t("sk.loc.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.loc.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : locations.length === 0 ? (
        <EmptyState title={t("sk.loc.empty")} body={t("sk.loc.emptyBody")} action={canManage ? add : undefined} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.search")} aria-label={t("sk.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {canManage ? <Button variant="primary" onClick={() => open("new")} aria-label={t("sk.loc.add")}><Plus className="size-5" aria-hidden /></Button>
              : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("sk.brands.viewOnly")}</Badge>}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("sk.loc.noMatch")}</p>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((s) => (
                <li key={s.id} className="flex min-h-20 items-center gap-3 border-t border-line p-3 first:border-t-0">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><Warehouse className="size-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1 leading-snug">
                    <b className="block break-words">{pick(locale, s.name, s.name_local)}</b>
                    {s.name_local && <small className="block break-words text-muted">{locale === "en" ? s.name_local : s.name}</small>}
                    {s.branch_id && branchName(s.branch_id) && <small className="block break-words text-muted">{branchName(s.branch_id)}</small>}
                    {s.address && <small className="block break-words text-muted">{s.address}</small>}
                    {!s.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canManage && (
                      <>
                        <button type="button" aria-label={`${t("sk.edit")}: ${s.name}`} onClick={() => open(s)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
                        <button type="button" aria-label={`${t("sk.delete")}: ${s.name}`} onClick={() => setRemoving(s)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <SidePanel sheet open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("sk.close")} title={editing === "new" ? t("sk.loc.add") : t("sk.loc.edit")}
        footer={<><Button onClick={() => setEditing(null)}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("sk.save")}</Button></>}>
        <div className="flex flex-col gap-5">
          <Input label={t("sk.loc.name")} value={form.name} maxLength={120} onChange={set("name")} error={errors.name} />
          <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={form.name_local} maxLength={120} onChange={set("name_local")} />
          <Select label={t("sk.loc.branch")} hint={t("sk.loc.branchHint")} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">{t("sk.loc.noBranch")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
          </Select>
          <Textarea label={t("sk.loc.address")} value={form.address} maxLength={500} rows={2} onChange={set("address")} />
          <Textarea label={t("sk.loc.note")} hint={t("sk.loc.noteHint")} value={form.note} maxLength={1000} rows={3} onChange={set("note")} />
          {editing !== "new" && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.loc.activeHint")}</small></div>
              <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
            </div>
          )}
        </div>
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.loc.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? fill(t("sk.loc.deleteBody"), { name: pick(locale, removing.name, removing.name_local) }) : ""}</p>
      </Modal>
    </main>
  );
}
