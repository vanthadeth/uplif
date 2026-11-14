"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, Pencil, Phone, Plus, Search, Trash2, Truck } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, SidePanel, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";

export interface Supplier {
  id: string; name: string; name_local: string | null; contact_name: string | null; phone: string | null;
  email: string | null; address: string | null; note: string | null; is_active: boolean;
}

const blank = { name: "", name_local: "", contact_name: "", phone: "", email: "", address: "", note: "" };

/** The supplier list: search, add, edit, hide and delete. A phone number is a tap-to-call link. */
export function SuppliersView({ suppliers, failed, companyId, canManage }: { suppliers: Supplier[]; failed: boolean; companyId: string; canManage: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [removing, setRemoving] = useState<Supplier | null>(null);
  const [form, setForm] = useState(blank);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors({}); };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((s) => !q || [s.name, s.name_local, s.contact_name, s.phone].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [suppliers, query]);

  function open(s: Supplier | "new") {
    setEditing(s);
    setForm(s === "new" ? blank : {
      name: s.name, name_local: s.name_local ?? "", contact_name: s.contact_name ?? "", phone: s.phone ?? "",
      email: s.email ?? "", address: s.address ?? "", note: s.note ?? "",
    });
    setActive(s === "new" ? true : s.is_active);
    setErrors({});
  }

  async function save() {
    const email = form.email.trim();
    if (!form.name.trim()) return setErrors({ name: t("sk.sup.nameRequired") });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErrors({ email: t("sk.sup.emailInvalid") });
    setBusy(true);
    const values = {
      name: form.name.trim(), name_local: form.name_local.trim() || null, contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null, email: email || null, address: form.address.trim() || null, note: form.note.trim() || null,
    };
    const supabase = createClient();
    const res = editing === "new"
      ? await supabase.from("suppliers").insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from("suppliers").update({ ...values, is_active: active }).eq("id", (editing as Supplier).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "23505" ? t("sk.sup.dup") : res.error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    toast("success", editing === "new" ? t("sk.sup.added") : t("sk.sup.saved"));
    setEditing(null);
    router.refresh();
  }

  async function remove(s: Supplier) {
    setBusy(true);
    const { data, error } = await createClient().from("suppliers").delete().eq("id", s.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    setRemoving(null);
    toast("success", t("sk.sup.deleted"));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.sup.add")}</Button>;

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.sup.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.sup.subtitle")}</p>
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.sup.roTitle")}</b>{t("sk.sup.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.sup.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : suppliers.length === 0 ? (
        <EmptyState title={t("sk.sup.empty")} body={t("sk.sup.emptyBody")} action={canManage ? add : undefined} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.search")} aria-label={t("sk.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {canManage ? <Button variant="primary" onClick={() => open("new")} aria-label={t("sk.sup.add")}><Plus className="size-5" aria-hidden /></Button>
              : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("sk.brands.viewOnly")}</Badge>}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("sk.sup.noMatch")}</p>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((s) => (
                <li key={s.id} className="flex min-h-20 items-center gap-3 border-t border-line p-3 first:border-t-0">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><Truck className="size-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1 leading-snug">
                    <b className="block break-words">{pick(locale, s.name, s.name_local)}</b>
                    {s.name_local && <small className="block break-words text-muted">{locale === "en" ? s.name_local : s.name}</small>}
                    {s.contact_name && <small className="block break-words text-muted">{s.contact_name}</small>}
                    {!s.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {s.phone && (
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} aria-label={fill(t("sk.sup.call"), { name: s.name })} className="grid size-11 place-items-center rounded-control text-link transition-colors hover:bg-primary-soft"><Phone className="size-5" aria-hidden /></a>
                    )}
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

      <SidePanel sheet open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("sk.close")} title={editing === "new" ? t("sk.sup.add") : t("sk.sup.edit")}
        footer={<><Button onClick={() => setEditing(null)}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("sk.save")}</Button></>}>
        <div className="flex flex-col gap-5">
          <Input label={t("sk.sup.name")} value={form.name} maxLength={120} onChange={set("name")} error={errors.name} />
          <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={form.name_local} maxLength={120} onChange={set("name_local")} />
          <Input label={t("sk.sup.contact")} value={form.contact_name} maxLength={120} onChange={set("contact_name")} />
          <Input label={t("sk.sup.phone")} type="tel" inputMode="tel" value={form.phone} maxLength={40} onChange={set("phone")} />
          <Input label={t("sk.sup.email")} type="email" inputMode="email" value={form.email} maxLength={200} onChange={set("email")} error={errors.email} />
          <Textarea label={t("sk.sup.address")} value={form.address} maxLength={500} rows={2} onChange={set("address")} />
          <Textarea label={t("sk.sup.note")} hint={t("sk.sup.noteHint")} value={form.note} maxLength={1000} rows={3} onChange={set("note")} />
          {editing !== "new" && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.sup.activeHint")}</small></div>
              <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
            </div>
          )}
        </div>
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.sup.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? fill(t("sk.sup.deleteBody"), { name: pick(locale, removing.name, removing.name_local) }) : ""}</p>
      </Modal>
    </main>
  );
}
