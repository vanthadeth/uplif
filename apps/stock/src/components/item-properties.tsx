"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal, SidePanel, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { money, pick } from "@/lib/format";

export type PropOption = { name: string; name_local: string | null; extra_charge: number };
export type PropGroup = { name: string; name_local: string | null; selection: "one" | "many"; required: boolean; options: PropOption[] };
export const MAX_GROUPS = 20;
const MAX_OPTIONS = 30;

/** Read the stored jsonb back into typed groups, ignoring anything malformed. */
export function parseProperties(raw: unknown): PropGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    if (!g || typeof g !== "object" || !Array.isArray((g as PropGroup).options)) return [];
    const x = g as PropGroup;
    return [{
      name: String(x.name ?? ""), name_local: x.name_local ? String(x.name_local) : null,
      selection: x.selection === "many" ? "many" as const : "one" as const, required: x.required === true,
      options: x.options.map((o) => ({ name: String(o.name ?? ""), name_local: o.name_local ? String(o.name_local) : null, extra_charge: Number(o.extra_charge) || 0 })),
    }];
  });
}

type OptRow = { name: string; name_local: string; extra: string };
const blankOpt = (): OptRow => ({ name: "", name_local: "", extra: "0" });

/** Choices the customer makes that are not counted in stock (sweetness, topping). Every action is saved at once. */
export function ItemProperties({ item, currency, canManage, onClose }: {
  item: { id: string; name: string; name_local: string | null; properties: PropGroup[] } | null;
  currency: string; canManage: boolean; onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [selection, setSelection] = useState<"one" | "many">("one");
  const [required, setRequired] = useState(true);
  const [opts, setOpts] = useState<OptRow[]>([blankOpt()]);
  const [errors, setErrors] = useState<{ name?: string; opts?: string }>({});

  const groups = useMemo(() => item?.properties ?? [], [item]);
  const label = (g: { name: string; name_local: string | null }) => pick(locale, g.name, g.name_local);
  const summary = groups.length
    ? fill(t("sk.prop.summary"), { names: groups.map(label).join(", ") })
    : t("sk.prop.summaryNone");

  function openForm(n: number | "new") {
    setEditing(n); setErrors({});
    const g = n === "new" ? null : groups[n];
    setName(g?.name ?? ""); setNameLocal(g?.name_local ?? ""); setSelection(g?.selection ?? "one"); setRequired(g?.required ?? true);
    setOpts(g ? g.options.map((o) => ({ name: o.name, name_local: o.name_local ?? "", extra: String(o.extra_charge) })) : [blankOpt()]);
  }
  function close() { setEditing(null); setHelp(false); onClose(); }
  const setOpt = (n: number, k: keyof OptRow, v: string) => { setOpts((o) => o.map((r, i) => (i === n ? { ...r, [k]: v } : r))); setErrors({}); };

  async function persist(next: PropGroup[], done: string) {
    if (!item) return;
    setBusy(true);
    const { data, error } = await createClient().from("items").update({ properties: next as never }).eq("id", item.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    toast("success", done);
    setEditing(null); setRemoving(null);
    router.refresh();
  }

  function save() {
    if (!name.trim()) return setErrors({ name: t("sk.prop.nameRequired") });
    const rows = opts.filter((o) => o.name.trim() || o.name_local.trim() || (o.extra.trim() && Number(o.extra) !== 0));
    const options = rows.map((o) => ({ name: o.name.trim(), name_local: o.name_local.trim() || null, extra_charge: o.extra.trim() === "" ? 0 : Number(o.extra) }));
    if (!options.length || options.some((o) => !o.name || !Number.isFinite(o.extra_charge) || o.extra_charge < 0)) return setErrors({ opts: t("sk.prop.optionsInvalid") });
    const group: PropGroup = { name: name.trim(), name_local: nameLocal.trim() || null, selection, required, options };
    if (editing === "new" && groups.length >= MAX_GROUPS) return toast("error", fill(t("sk.prop.limit"), { max: MAX_GROUPS }));
    const next = editing === "new" ? [...groups, group] : groups.map((g, i) => (i === editing ? group : g));
    return persist(next, editing === "new" ? t("sk.prop.added") : t("sk.prop.saved"));
  }

  const footer = editing !== null
    ? <><Button onClick={() => setEditing(null)}>{t("sk.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("sk.save")}</Button></>
    : canManage ? <Button variant="primary" onClick={() => openForm("new")}><Plus className="size-[18px]" aria-hidden />{t("sk.prop.add")}</Button> : undefined;

  return (
    <>
      <SidePanel sheet open={item !== null} onClose={editing === null ? close : () => setEditing(null)} closeLabel={t("sk.close")}
        title={editing !== null ? (editing === "new" ? t("sk.prop.add") : t("sk.prop.edit")) : `${t("sk.prop.title")}: ${item ? pick(locale, item.name, item.name_local) : ""}`} footer={footer}>
        {editing === null ? (
          <div className="flex flex-col gap-4">
            <div>
              <b className="block">{t("sk.prop.question")}</b>
              <p className="mt-1 text-muted">{t("sk.prop.help")}</p>
            </div>
            <div role="status" className="flex items-start gap-3 rounded-card bg-primary-soft p-3 leading-normal text-primary-ink">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden /><span>{summary}</span>
            </div>
            <div>
              <button type="button" aria-expanded={help} onClick={() => setHelp((h) => !h)} className="min-h-11 font-semibold text-link">{t("sk.prop.notSure")}</button>
              {help && <p className="rounded-card border border-line p-3 text-muted">{t("sk.prop.notSureBody")}</p>}
            </div>
            {groups.length === 0 ? (
              <EmptyState title={t("sk.prop.empty")} body={canManage ? t("sk.prop.emptyBody") : t("sk.prop.roEmpty")} />
            ) : (
              <ul className="flex flex-col gap-3">
                {groups.map((g, n) => (
                  <li key={n} className="rounded-card border border-line bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 leading-snug">
                        <b className="block break-words">{label(g)}</b>
                        {g.name_local && <small className="block break-words text-muted">{locale === "en" ? g.name_local : g.name}</small>}
                        <small className="block text-muted">{g.selection === "one" ? t("sk.prop.pickOne") : t("sk.prop.pickMany")}</small>
                        {g.required && <Badge tone="info">{t("sk.prop.mustChoose")}</Badge>}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" aria-label={`${t("sk.edit")}: ${g.name}`} onClick={() => openForm(n)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft"><Pencil className="size-5" aria-hidden /></button>
                          <button type="button" aria-label={`${t("sk.delete")}: ${g.name}`} onClick={() => setRemoving(n)} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                        </div>
                      )}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {g.options.map((o, k) => (
                        <li key={k} className="rounded-control border border-line px-3 py-1.5 leading-snug">
                          {label(o)} <span className="text-muted">· {o.extra_charge > 0 ? fill(t("sk.prop.extra"), { amount: money(locale, o.extra_charge, currency) }) : t("sk.prop.free")}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <Input label={t("sk.prop.name")} hint={t("sk.prop.nameHint")} value={name} maxLength={80} error={errors.name} onChange={(e) => { setName(e.target.value); setErrors({}); }} />
            <Input label={t("sk.brands.nameLocal")} hint={t("sk.brands.nameLocalHint")} value={nameLocal} maxLength={80} onChange={(e) => setNameLocal(e.target.value)} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[14px] font-semibold text-ink-2">{t("sk.prop.selection")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["one", "many"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={selection === s} onClick={() => setSelection(s)}
                    className={`min-h-11 rounded-card border px-4 transition-colors ${selection === s ? "border-primary bg-primary-soft font-semibold" : "border-line-strong"}`}>{t(s === "one" ? "sk.prop.one" : "sk.prop.many")}</button>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
              <div className="min-w-0"><b className="block">{t("sk.prop.required")}</b><small className="block text-muted">{t("sk.prop.requiredHint")}</small></div>
              <Toggle checked={required} onChange={setRequired} label={t("sk.prop.required")} />
            </div>
            <fieldset className="flex flex-col gap-3 rounded-card border border-line p-3">
              <legend className="px-1 font-semibold">{t("sk.prop.options")}</legend>
              {opts.map((o, n) => (
                <div key={n} className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1"><Input label={t("sk.prop.optionName")} value={o.name} maxLength={80} onChange={(e) => setOpt(n, "name", e.target.value)} /></div>
                    {opts.length > 1 && (
                      <button type="button" aria-label={t("sk.prop.optionRemove")} onClick={() => setOpts((r) => r.filter((_, i) => i !== n))} className="grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><X className="size-5" aria-hidden /></button>
                    )}
                  </div>
                  <Input label={t("sk.brands.nameLocal")} value={o.name_local} maxLength={80} onChange={(e) => setOpt(n, "name_local", e.target.value)} />
                  <Input label={t("sk.prop.optionExtra")} hint={fill(t("sk.prop.extraHint"), { currency })} type="number" inputMode="decimal" min={0} step="any" value={o.extra} onChange={(e) => setOpt(n, "extra", e.target.value)} />
                </div>
              ))}
              {errors.opts && <p role="alert" className="text-danger">{errors.opts}</p>}
              {opts.length < MAX_OPTIONS && (
                <Button onClick={() => setOpts((r) => [...r, blankOpt()])}><Plus className="size-[18px]" aria-hidden />{t("sk.prop.optionAdd")}</Button>
              )}
            </fieldset>
          </div>
        )}
      </SidePanel>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("sk.close")} title={t("sk.prop.deleteTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("sk.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing !== null && persist(groups.filter((_, i) => i !== removing), t("sk.prop.deleted"))}>{t("sk.delete")}</Button></>}>
        <p>{removing !== null && groups[removing] ? fill(t("sk.prop.deleteBody"), { name: label(groups[removing]) }) : ""}</p>
      </Modal>
    </>
  );
}
