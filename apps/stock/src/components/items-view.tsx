"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, SidePanel, Textarea, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { money, pick } from "@/lib/format";

export type Pack = { name: string; qty: number };
export interface Item {
  id: string; sku: string | null; name: string; name_local: string | null; description: string | null; description_local: string | null;
  category_id: string | null; brand_id: string | null; base_uom: string; packs: Pack[]; price: number; currency_code: string; is_active: boolean;
}
interface Cat { id: string; parent_id: string | null; name: string; name_local: string | null; is_active: boolean }
interface Brand { id: string; name: string; name_local: string | null; is_active: boolean }

const blank = { name: "", name_local: "", description: "", description_local: "", sku: "", category_id: "", brand_id: "", base_uom: "pcs", price: "0" };
type PackRow = { name: string; qty: string };
type Errors = { name?: string; uom?: string; price?: string; packs?: string; sku?: string };

/** The item list: search, add, edit, hide and delete. Pictures, variants and options come in later pieces. */
export function ItemsView({ items, categories, brands, currency, failed, companyId, canManage }: {
  items: Item[]; categories: Cat[]; brands: Brand[]; currency: string; failed: boolean; companyId: string; canManage: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [form, setForm] = useState(blank);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors({}); };

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const label = (n: { name: string; name_local: string | null }) => pick(locale, n.name, n.name_local);
  const catPath = (id: string | null) => {
    const c = id ? catById.get(id) : undefined;
    if (!c) return "";
    const parent = c.parent_id ? catById.get(c.parent_id) : undefined;
    return parent ? `${label(parent)} › ${label(c)}` : label(c);
  };

  // Category choices: main categories with their sub-categories under them. A hidden one stays listed while the item uses it.
  const categoryOptions = useMemo(() => {
    const keep = (c: Cat) => c.is_active || c.id === form.category_id;
    const out: { id: string; text: string }[] = [];
    for (const top of categories.filter((c) => !c.parent_id && (keep(c) || categories.some((s) => s.parent_id === c.id && keep(s))))) {
      out.push({ id: top.id, text: label(top) });
      for (const sub of categories.filter((c) => c.parent_id === top.id && keep(c))) out.push({ id: sub.id, text: `${label(top)} › ${label(sub)}` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, form.category_id, locale]);
  const brandOptions = useMemo(() => brands.filter((b) => b.is_active || b.id === form.brand_id), [brands, form.brand_id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || [i.name, i.name_local, i.sku].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [items, query]);

  function open(i: Item | "new") {
    setEditing(i);
    setForm(i === "new" ? { ...blank } : {
      name: i.name, name_local: i.name_local ?? "", description: i.description ?? "", description_local: i.description_local ?? "",
      sku: i.sku ?? "", category_id: i.category_id ?? "", brand_id: i.brand_id ?? "", base_uom: i.base_uom, price: String(i.price),
    });
    setPacks(i === "new" ? [] : i.packs.map((p) => ({ name: p.name, qty: String(p.qty) })));
    setActive(i === "new" ? true : i.is_active);
    setErrors({});
  }

  async function save() {
    const price = form.price.trim() === "" ? 0 : Number(form.price);
    if (!form.name.trim()) return setErrors({ name: t("sk.item.nameRequired") });
    if (!form.base_uom.trim()) return setErrors({ uom: t("sk.item.uomRequired") });
    if (!Number.isFinite(price) || price < 0) return setErrors({ price: t("sk.item.priceInvalid") });
    const cleanPacks = packs.filter((p) => p.name.trim() || p.qty.trim());
    const parsed: Pack[] = cleanPacks.map((p) => ({ name: p.name.trim(), qty: Number(p.qty) }));
    if (parsed.some((p) => !p.name || !Number.isInteger(p.qty) || p.qty < 2)) return setErrors({ packs: t("sk.item.packInvalid") });
    setBusy(true);
    const values = {
      sku: form.sku.trim() || null, name: form.name.trim(), name_local: form.name_local.trim() || null,
      description: form.description.trim() || null, description_local: form.description_local.trim() || null,
      category_id: form.category_id || null, brand_id: form.brand_id || null, base_uom: form.base_uom.trim(), packs: parsed, price,
    };
    const supabase = createClient();
    const res = editing === "new"
      ? await supabase.from("items").insert({ company_id: companyId, currency_code: currency, ...values }).select("id")
      : await supabase.from("items").update({ ...values, is_active: active }).eq("id", (editing as Item).id).select("id");
    setBusy(false);
    if (res.error) {
      if (res.error.code === "23505") return setErrors({ sku: t("sk.item.skuDup") });
      return toast("error", res.error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    }
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    toast("success", editing === "new" ? t("sk.item.added") : t("sk.item.saved"));
    setEditing(null);
    router.refresh();
  }

  async function remove(i: Item) {
    setBusy(true);
    const { data, error } = await createClient().from("items").delete().eq("id", i.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    setRemoving(null);
    toast("success", t("sk.item.deleted"));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.item.add")}</Button>;
  const editCurrency = editing && editing !== "new" ? editing.currency_code : currency;

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.item.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.item.subtitle")}</p>
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.item.roTitle")}</b>{t("sk.item.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.item.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : items.length === 0 ? (
        <EmptyState title={t("sk.item.empty")} body={t("sk.item.emptyBody")} action={canManage ? add : undefined} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.search")} aria-label={t("sk.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {canManage ? <Button variant="primary" onClick={() => open("new")} aria-label={t("sk.item.add")}><Plus className="size-5" aria-hidden /></Button>
              : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("sk.brands.viewOnly")}</Badge>}
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("sk.item.noMatch")}</p>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((i) => {
                const sub = [catPath(i.category_id), i.brand_id ? brandById.get(i.brand_id) && label(brandById.get(i.brand_id)!) : ""].filter(Boolean).join(" · ");
                return (
                  <li key={i.id} className="flex min-h-20 items-center gap-3 border-t border-line p-3 first:border-t-0">
                    <span className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-ink"><Package className="size-6" aria-hidden /></span>
                    <div className="min-w-0 flex-1 leading-snug">
                      <b className="block break-words">{pick(locale, i.name, i.name_local)}</b>
                      {i.name_local && <small className="block break-words text-muted">{locale === "en" ? i.name_local : i.name}</small>}
                      {sub && <small className="block break-words text-muted">{sub}</small>}
                      <small className="block text-muted">{money(locale, i.price, i.currency_code)} · {i.base_uom}{i.sku ? ` · ${i.sku}` : ""}</small>
                      {!i.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" aria-label={`${t("sk.edit")}: ${i.name}`} onClick={() => open(i)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
                        <button type="button" aria-label={`${t("sk.delete")}: ${i.name}`} onClick={() => setRemoving(i)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <SidePanel sheet open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("sk.close")} title={editing === "new" ? t("sk.item.add") : t("sk.item.edit")}
        footer={<><Button onClick={() => setEditing(null)}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("sk.save")}</Button></>}>
        <div className="flex flex-col gap-5">
          <Input label={t("sk.item.name")} value={form.name} maxLength={160} onChange={set("name")} error={errors.name} />
          <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={form.name_local} maxLength={160} onChange={set("name_local")} />
          <Select label={t("sk.item.category")} value={form.category_id} onChange={set("category_id")}>
            <option value="">{t("sk.item.noCategory")}</option>
            {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
          </Select>
          <Select label={t("sk.item.brand")} value={form.brand_id} onChange={set("brand_id")}>
            <option value="">{t("sk.item.noBrand")}</option>
            {brandOptions.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
          </Select>
          <Input label={t("sk.item.price")} hint={fill(t("sk.item.priceHint"), { currency: editCurrency })} type="number" inputMode="decimal" min={0} step="any"
            value={form.price} onChange={set("price")} error={errors.price} />
          <Input label={t("sk.item.uom")} hint={t("sk.item.uomHint")} value={form.base_uom} maxLength={30} onChange={set("base_uom")} error={errors.uom} />

          <fieldset className="flex flex-col gap-3 rounded-card border border-line p-3">
            <legend className="px-1 font-semibold">{t("sk.item.packs")}</legend>
            <p className="text-muted">{t("sk.item.packsHint")}</p>
            {packs.map((p, n) => (
              <div key={n} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input label={t("sk.item.packName")} value={p.name} maxLength={40}
                    onChange={(e) => { setPacks((r) => r.map((x, k) => (k === n ? { ...x, name: e.target.value } : x))); setErrors({}); }} />
                </div>
                <div className="w-28 shrink-0">
                  <Input label={t("sk.item.packQty")} type="number" inputMode="numeric" min={2} step={1} value={p.qty}
                    onChange={(e) => { setPacks((r) => r.map((x, k) => (k === n ? { ...x, qty: e.target.value } : x))); setErrors({}); }} />
                </div>
                <button type="button" aria-label={t("sk.item.packRemove")} onClick={() => setPacks((r) => r.filter((_, k) => k !== n))}
                  className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><X className="size-5" aria-hidden /></button>
              </div>
            ))}
            {errors.packs && <p role="alert" className="text-danger">{errors.packs}</p>}
            {packs.length < 10 && (
              <Button onClick={() => setPacks((r) => [...r, { name: "", qty: "" }])}><Plus className="size-[18px]" aria-hidden />{t("sk.item.packAdd")}</Button>
            )}
          </fieldset>

          <Input label={t("sk.item.sku")} hint={t("sk.item.skuHint")} value={form.sku} maxLength={60} onChange={set("sku")} error={errors.sku} />
          <Textarea label={t("sk.item.description")} value={form.description} maxLength={2000} rows={3} onChange={set("description")} />
          <Textarea label={t("sk.item.descriptionLocal")} value={form.description_local} maxLength={2000} rows={3} onChange={set("description_local")} />
          {editing !== "new" && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.item.activeHint")}</small></div>
              <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
            </div>
          )}
        </div>
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.item.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? fill(t("sk.item.deleteBody"), { name: pick(locale, removing.name, removing.name_local) }) : ""}</p>
      </Modal>
    </main>
  );
}
