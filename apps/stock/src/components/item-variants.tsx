"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, Info, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal, SidePanel, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { money, pick } from "@/lib/format";
import type { ItemImage } from "@/components/item-pictures";

export interface Variant {
  id: string; item_id: string; name: string; name_local: string | null; sku: string | null; barcode: string | null;
  price: number | null; image_id: string | null; is_default: boolean; is_active: boolean;
}
export const MAX_VARIANTS = 100;

const blank = { name: "", name_local: "", sku: "", barcode: "", price: "", image_id: "" };
type Mode = "list" | "form" | "generate";

/** Split a typed list ("S, M, L") into clean, distinct values. */
const parseList = (s: string) => {
  const seen = new Set<string>();
  return s.split(/[,\n]/).map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};

/** The counted versions of one item (shirt sizes, cup sizes). Every action is saved at once. */
export function ItemVariants({ item, variants, images, currency, companyId, canManage, onClose }: {
  item: { id: string; name: string; name_local: string | null; price: number } | null; variants: Variant[]; images: ItemImage[];
  currency: string; companyId: string; canManage: boolean; onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Variant | "new" | null>(null);
  const [removing, setRemoving] = useState<Variant | null>(null);
  const [form, setForm] = useState(blank);
  const [active, setActive] = useState(true);
  const [list1, setList1] = useState("");
  const [list2, setList2] = useState("");
  const [help, setHelp] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string; sku?: string; barcode?: string; lists?: string }>({});
  const [defaultBarcode, setDefaultBarcode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors({}); };

  const mine = useMemo(() => (item ? variants.filter((v) => v.item_id === item.id) : []), [item, variants]);
  const real = mine.filter((v) => !v.is_default);
  const def = mine.find((v) => v.is_default);
  const itemImages = item ? images.filter((i) => i.item_id === item.id) : [];
  const mainUrl = itemImages.find((i) => i.is_main)?.url ?? null;
  const urlOf = (v: Variant) => itemImages.find((i) => i.id === v.image_id)?.url ?? mainUrl;
  const label = (v: { name: string; name_local: string | null }) => pick(locale, v.name, v.name_local);

  const generated = useMemo(() => {
    const a = parseList(list1), b = parseList(list2);
    const names = b.length ? a.flatMap((x) => b.map((y) => `${x} / ${y}`)) : a;
    const have = new Set(real.map((v) => v.name.trim().toLowerCase()));
    return names.filter((n) => !have.has(n.toLowerCase()));
  }, [list1, list2, real]);

  function close() { setMode("list"); setEditing(null); setHelp(false); setDefaultBarcode(null); onClose(); }
  function back() { setMode("list"); setEditing(null); setErrors({}); }
  function openForm(v: Variant | "new") {
    setEditing(v); setMode("form"); setErrors({});
    setForm(v === "new" ? blank : { name: v.name, name_local: v.name_local ?? "", sku: v.sku ?? "", barcode: v.barcode ?? "", price: v.price == null ? "" : String(v.price), image_id: v.image_id ?? "" });
    setActive(v === "new" ? true : v.is_active);
  }
  function failure(err: { code?: string; message?: string }) {
    if (err.code === "23505") {
      const m = err.message ?? "";
      if (m.includes("barcode")) return setErrors({ barcode: t("sk.var.barcodeDup") });
      if (m.includes("sku")) return setErrors({ sku: t("sk.var.skuDup") });
      return setErrors({ name: t("sk.var.nameDup") });
    }
    toast("error", err.code === "42501" ? t("sk.forbidden") : err.code === "P0001" ? fill(t("sk.var.limit"), { max: String(MAX_VARIANTS) }) : t("sk.saveError"));
  }

  async function save() {
    if (!item) return;
    const price = form.price.trim() === "" ? null : Number(form.price);
    if (!form.name.trim()) return setErrors({ name: t("sk.var.nameRequired") });
    if (price !== null && (!Number.isFinite(price) || price < 0)) return setErrors({ price: t("sk.item.priceInvalid") });
    setBusy(true);
    const values = {
      name: form.name.trim(), name_local: form.name_local.trim() || null, sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null, price, image_id: form.image_id || null,
    };
    const supabase = createClient();
    const res = editing === "new"
      ? await supabase.from("item_variants").insert({ company_id: companyId, item_id: item.id, ...values }).select("id")
      : await supabase.from("item_variants").update({ ...values, is_active: active }).eq("id", (editing as Variant).id).select("id");
    setBusy(false);
    if (res.error) return failure(res.error);
    if (!res.data?.length) return toast("error", t("sk.forbidden"));
    toast("success", editing === "new" ? t("sk.var.added") : t("sk.var.saved"));
    back();
    router.refresh();
  }

  async function createMany() {
    if (!item) return;
    if (!parseList(list1).length) return setErrors({ lists: t("sk.var.genNone") });
    if (real.length + generated.length > MAX_VARIANTS) return setErrors({ lists: fill(t("sk.var.genTooMany"), { max: String(MAX_VARIANTS) }) });
    if (!generated.length) return back();
    setBusy(true);
    const { data, error } = await createClient().from("item_variants")
      .insert(generated.map((name) => ({ company_id: companyId, item_id: item.id, name }))).select("id");
    setBusy(false);
    if (error) return failure(error);
    if (!data?.length) return toast("error", t("sk.forbidden"));
    toast("success", fill(t("sk.var.addedMany"), { n: String(data.length) }));
    setList1(""); setList2("");
    back();
    router.refresh();
  }

  async function remove(v: Variant) {
    setBusy(true);
    const { data, error } = await createClient().from("item_variants").delete().eq("id", v.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : error.code === "23503" ? t("sk.inuse") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    setRemoving(null);
    toast("success", t("sk.var.deleted"));
    router.refresh();
  }

  async function saveDefaultBarcode() {
    if (!def || defaultBarcode === null) return;
    setBusy(true);
    const { data, error } = await createClient().from("item_variants").update({ barcode: defaultBarcode.trim() || null }).eq("id", def.id).select("id");
    setBusy(false);
    if (error) return failure(error);
    if (!data?.length) return toast("error", t("sk.forbidden"));
    toast("success", t("sk.var.saved"));
    setDefaultBarcode(null);
    router.refresh();
  }

  const title = item ? `${t("sk.var.title")}: ${pick(locale, item.name, item.name_local)}` : t("sk.var.title");
  const summary = real.length
    ? fill(t("sk.var.summary"), { n: String(real.length), names: real.slice(0, 6).map(label).join(", ") + (real.length > 6 ? ", …" : "") })
    : t("sk.var.summaryNone");

  const footer = mode === "form"
    ? <><Button onClick={back}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("sk.save")}</Button></>
    : mode === "generate"
      ? <><Button onClick={back}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} disabled={generated.length === 0} onClick={createMany}>{t("sk.var.genCreate")}</Button></>
      : canManage
        ? <><Button onClick={() => { setMode("generate"); setErrors({}); }}><Wand2 className="size-[18px]" aria-hidden />{t("sk.var.generate")}</Button>
          <Button variant="primary" onClick={() => openForm("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.var.add")}</Button></>
        : undefined;

  return (
    <>
      <SidePanel sheet open={item !== null} onClose={mode === "list" ? close : back} closeLabel={t("sk.close")}
        title={mode === "form" ? (editing === "new" ? t("sk.var.add") : t("sk.var.edit")) : mode === "generate" ? t("sk.var.generate") : title} footer={footer}>
        {mode === "list" && (
          <div className="flex flex-col gap-4">
            <div>
              <b className="block">{t("sk.var.question")}</b>
              <p className="mt-1 text-muted">{t("sk.var.help")}</p>
            </div>
            <div role="status" className="flex items-start gap-3 rounded-card bg-primary-soft p-3 leading-normal text-primary-ink">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden /><span>{summary}</span>
            </div>
            <div>
              <button type="button" aria-expanded={help} onClick={() => setHelp((h) => !h)} className="min-h-11 font-semibold text-link">{t("sk.var.notSure")}</button>
              {help && <p className="rounded-card border border-line p-3 text-muted">{t("sk.var.notSureBody")}</p>}
            </div>

            {real.length === 0 ? (
              <>
                {def && canManage && (
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Input label={t("sk.var.barcodeItem")} value={defaultBarcode ?? def.barcode ?? ""} maxLength={60} error={errors.barcode}
                        onChange={(e) => { setDefaultBarcode(e.target.value); setErrors({}); }} />
                    </div>
                    {defaultBarcode !== null && <Button variant="primary" loading={busy} onClick={saveDefaultBarcode}>{t("sk.save")}</Button>}
                  </div>
                )}
                {def && !canManage && def.barcode && <p className="text-muted">{t("sk.var.barcodeItem")}: {def.barcode}</p>}
                <EmptyState title={t("sk.var.empty")} body={canManage ? t("sk.var.emptyBody") : t("sk.var.roEmpty")} />
              </>
            ) : (
              <ul className="overflow-hidden rounded-card border border-line bg-surface">
                {real.map((v) => (
                  <li key={v.id} className="flex min-h-20 items-center gap-3 border-t border-line p-3 first:border-t-0">
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-card bg-primary-soft text-primary-ink">
                      {urlOf(v) ? <img src={urlOf(v)!} alt="" className="size-full object-cover" /> : <ImageIcon className="size-6" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1 leading-snug">
                      <b className="block break-words">{label(v)}</b>
                      {v.name_local && <small className="block break-words text-muted">{locale === "en" ? v.name_local : v.name}</small>}
                      <small className="block text-muted">{money(locale, v.price ?? item?.price ?? 0, currency)}{v.barcode ? ` · ${v.barcode}` : ""}{v.sku ? ` · ${v.sku}` : ""}</small>
                      {!v.is_active && <Badge tone="neutral">{t("sk.brands.inactive")}</Badge>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" aria-label={`${t("sk.edit")}: ${v.name}`} onClick={() => openForm(v)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
                        <button type="button" aria-label={`${t("sk.delete")}: ${v.name}`} onClick={() => setRemoving(v)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === "form" && (
          <div className="flex flex-col gap-5">
            <Input label={t("sk.var.name")} value={form.name} maxLength={160} onChange={set("name")} error={errors.name} />
            <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={form.name_local} maxLength={160} onChange={set("name_local")} />
            <Input label={t("sk.var.price")} hint={`${t("sk.var.priceHint")} (${currency})`} type="number" inputMode="decimal" min={0} step="any" value={form.price} onChange={set("price")} error={errors.price} />
            <Input label={t("sk.var.barcode")} value={form.barcode} maxLength={60} onChange={set("barcode")} error={errors.barcode} />
            <Input label={t("sk.var.sku")} value={form.sku} maxLength={60} onChange={set("sku")} error={errors.sku} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[14px] font-semibold text-ink-2">{t("sk.var.picture")}</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={form.image_id === ""} onClick={() => setForm((f) => ({ ...f, image_id: "" }))}
                  className={`min-h-16 rounded-card border px-3 text-start transition-colors ${form.image_id === "" ? "border-primary bg-primary-soft" : "border-line-strong"}`}>{t("sk.var.noPicture")}</button>
                {itemImages.map((img) => (
                  <button key={img.id} type="button" aria-pressed={form.image_id === img.id} onClick={() => setForm((f) => ({ ...f, image_id: img.id }))}
                    className={`relative size-16 overflow-hidden rounded-card border-2 transition-colors ${form.image_id === img.id ? "border-primary" : "border-line"}`}>
                    {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
                    {form.image_id === img.id && <span className="absolute inset-0 grid place-items-center bg-primary/40 text-white"><Check className="size-6" aria-hidden /></span>}
                  </button>
                ))}
              </div>
            </fieldset>
            {editing !== "new" && (
              <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
                <div className="min-w-0"><b className="block">{t("sk.brands.active")}</b><small className="block text-muted">{t("sk.var.activeHint")}</small></div>
                <Toggle checked={active} onChange={setActive} label={t("sk.brands.active")} />
              </div>
            )}
          </div>
        )}

        {mode === "generate" && (
          <div className="flex flex-col gap-5">
            <p className="text-muted">{t("sk.var.genHelp")}</p>
            <Input label={t("sk.var.list1")} hint={t("sk.var.listHint")} value={list1} onChange={(e) => { setList1(e.target.value); setErrors({}); }} error={errors.lists} />
            <Input label={t("sk.var.list2")} hint={t("sk.var.listHint")} value={list2} onChange={(e) => { setList2(e.target.value); setErrors({}); }} />
            {generated.length > 0 && (
              <div role="status" className="rounded-card bg-primary-soft p-3 text-primary-ink">
                <b className="block">{fill(t("sk.var.genPreview"), { n: String(generated.length) })}</b>
                <span className="break-words">{generated.slice(0, 12).join(", ")}{generated.length > 12 ? ", …" : ""}</span>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.var.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("sk.delete")}</Button></>}>
        <p>{removing ? fill(t("sk.var.deleteBody"), { name: label(removing) }) : ""}</p>
      </Modal>
    </>
  );
}
