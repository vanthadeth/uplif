"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Plus, Search, Trash2 } from "lucide-react";
import { Button, EmptyState, ErrorState, Input, Select, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";

export interface ReceiveOption {
  variantId: string; itemName: string; itemNameLocal: string | null; variantName: string | null; variantNameLocal: string | null;
  sku: string | null; barcode: string | null; uom: string; packs: { name: string; qty: number }[];
}
interface Named { id: string; name: string; name_local: string | null }
interface Receipt { id: string; location_id: string; supplier_id: string | null; reference: string | null; created_at: string; lines: number }
type Line = { variantId: string; qty: string };

/** Move stock. This piece: receive stock from a supplier into a location. Adjustments and transfers come next. */
export function MoveView({ locations, suppliers, options, recent, failed, canMove }: {
  locations: Named[]; suppliers: Named[]; options: ReceiveOption[]; recent: Receipt[]; failed: boolean; canMove: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [location, setLocation] = useState(locations.length === 1 ? locations[0].id : "");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<{ location?: string; lines?: string }>({});
  const [busy, setBusy] = useState(false);
  // One id per form, so a retry after a dropped connection can never receive the same delivery twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const byId = useMemo(() => new Map(options.map((o) => [o.variantId, o])), [options]);
  const label = (n: Named) => pick(locale, n.name, n.name_local);
  const optionName = (o: ReceiveOption) => {
    const item = pick(locale, o.itemName, o.itemNameLocal);
    return o.variantName ? `${item} · ${pick(locale, o.variantName, o.variantNameLocal)}` : item;
  };
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const used = new Set(lines.map((l) => l.variantId));
    return options.filter((o) => !used.has(o.variantId) &&
      [o.itemName, o.itemNameLocal, o.variantName, o.variantNameLocal, o.sku, o.barcode].some((x) => x && x.toLowerCase().includes(q))).slice(0, 8);
  }, [query, options, lines]);

  const addLine = (id: string, qty = "") => { setLines((l) => [...l, { variantId: id, qty }]); setQuery(""); setErrors({}); };
  const setQty = (id: string, qty: string) => { setLines((l) => l.map((x) => (x.variantId === id ? { ...x, qty } : x))); setErrors({}); };
  const addPack = (id: string, packQty: number) => setLines((l) => l.map((x) => (x.variantId === id ? { ...x, qty: String((Number(x.qty) || 0) + packQty) } : x)));

  async function submit() {
    if (!location) return setErrors({ location: t("sk.mv.locationRequired") });
    if (!lines.length) return setErrors({ lines: t("sk.mv.noLines") });
    const parsed = lines.map((l) => ({ variant_id: l.variantId, qty: Number(l.qty) }));
    if (parsed.some((l) => !Number.isFinite(l.qty) || l.qty <= 0)) return setErrors({ lines: t("sk.mv.qtyInvalid") });
    setBusy(true);
    const { error } = await createClient().rpc("receive_stock", {
      p_request_id: requestId, p_location_id: location, p_supplier_id: supplier || null,
      p_reference: reference.trim() || null, p_note: note.trim() || null, p_lines: parsed,
    });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : error.code === "P0001" ? t("sk.mv.failed") : t("sk.saveError"));
    toast("success", t("sk.mv.done"));
    setLines([]); setReference(""); setNote(""); setSupplier(""); setQuery(""); setErrors({});
    setRequestId(crypto.randomUUID());
    router.refresh();
  }

  const nameOf = (list: Named[], id: string | null) => { const n = list.find((x) => x.id === id); return n ? label(n) : ""; };

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.mv.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.mv.subtitle")}</p>
      </div>
      {!canMove && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("sk.mv.roTitle")}</b>{t("sk.mv.roBody")}</div>
        </div>
      )}

      {failed ? (
        <ErrorState title={t("sk.mv.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : (
        <>
          {canMove && (locations.length === 0 ? (
            <EmptyState title={t("sk.mv.noLocation")} body={t("sk.mv.noLocationBody")} action={<Link href="/locations"><Button variant="primary">{t("sk.mv.addLocation")}</Button></Link>} />
          ) : options.length === 0 ? (
            <EmptyState title={t("sk.mv.noItems")} body={t("sk.mv.noItemsBody")} action={<Link href="/items"><Button variant="primary">{t("sk.item.add")}</Button></Link>} />
          ) : (
            <section aria-label={t("sk.mv.receive")} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
              <h2 className="text-lg font-bold">{t("sk.mv.receive")}</h2>
              <Select label={t("sk.mv.location")} value={location} error={errors.location} onChange={(e) => { setLocation(e.target.value); setErrors({}); }}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
              </Select>
              <Select label={t("sk.mv.supplier")} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">{t("sk.mv.noSupplier")}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
              </Select>
              <Input label={t("sk.mv.reference")} value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[14px] font-semibold text-ink-2">{t("sk.mv.lines")}</legend>
                <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
                  <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.mv.search")} aria-label={t("sk.mv.search")}
                    className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
                </label>
                {query.trim() && (matches.length === 0
                  ? <p className="text-muted">{t("sk.mv.searchEmpty")}</p>
                  : <ul className="overflow-hidden rounded-card border border-line">
                    {matches.map((o) => (
                      <li key={o.variantId} className="border-t border-line first:border-t-0">
                        <button type="button" aria-label={fill(t("sk.mv.add"), { name: optionName(o) })} onClick={() => addLine(o.variantId)}
                          className="flex min-h-14 w-full items-center gap-3 px-3 text-start transition-colors hover:bg-primary-soft">
                          <Plus className="size-5 shrink-0 text-link" aria-hidden />
                          <span className="min-w-0 flex-1 leading-snug"><b className="block break-words">{optionName(o)}</b>
                            <small className="text-muted">{[o.sku, o.barcode].filter(Boolean).join(" · ")}</small></span>
                        </button>
                      </li>
                    ))}
                  </ul>)}
                {lines.map((l) => {
                  const o = byId.get(l.variantId)!;
                  return (
                    <div key={l.variantId} className="flex flex-col gap-2 rounded-card border border-line p-3">
                      <div className="flex items-start gap-2">
                        <b className="min-w-0 flex-1 break-words leading-snug">{optionName(o)}</b>
                        <button type="button" aria-label={fill(t("sk.mv.removeLine"), { name: optionName(o) })} onClick={() => setLines((x) => x.filter((y) => y.variantId !== l.variantId))}
                          className="grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                      </div>
                      <Input label={fill(t("sk.mv.qty"), { unit: o.uom })} type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={(e) => setQty(l.variantId, e.target.value)} />
                      {o.packs.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {o.packs.map((p) => (
                            <button key={p.name} type="button" onClick={() => addPack(l.variantId, p.qty)}
                              className="min-h-11 rounded-control border border-line-strong px-3 font-semibold transition-colors hover:bg-primary-soft">{fill(t("sk.mv.packAdd"), { name: p.name, qty: p.qty })}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {errors.lines && <p role="alert" className="text-danger">{errors.lines}</p>}
              </fieldset>

              <Textarea label={t("sk.mv.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              <Button variant="primary" loading={busy} onClick={submit}>{t("sk.mv.submit")}</Button>
            </section>
          ))}

          <section aria-label={t("sk.mv.recent")} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{t("sk.mv.recent")}</h2>
            {recent.length === 0 ? <p className="text-muted">{t("sk.mv.recentEmpty")}</p> : (
              <ul className="overflow-hidden rounded-card border border-line bg-surface">
                {recent.map((r) => (
                  <li key={r.id} className="flex min-h-16 flex-col justify-center border-t border-line p-3 leading-snug first:border-t-0">
                    <b className="break-words">{nameOf(locations, r.location_id) || "—"}{r.reference ? ` · ${r.reference}` : ""}</b>
                    <small className="text-muted">
                      {new Date(r.created_at).toLocaleString(locale)} · {fill(t("sk.mv.itemsCount"), { n: r.lines })}{r.supplier_id ? ` · ${nameOf(suppliers, r.supplier_id)}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
