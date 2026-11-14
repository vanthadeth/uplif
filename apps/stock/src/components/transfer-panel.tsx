"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button, Input, Select, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick, qtyText } from "@/lib/format";
import type { ReceiveOption } from "./move-view";

interface Named { id: string; name: string; name_local: string | null }
export interface TransitTransfer { id: string; fromId: string; toId: string; sentAt: string; note: string | null; lines: { variantId: string; qty: number }[] }
type Line = { variantId: string; qty: string };

/** Transfers in two steps: send from one location (stock goes "in transit"), then the receiving side confirms. */
export function TransferPanel({ locations, options, balances, transit }: {
  locations: Named[]; options: ReceiveOption[]; balances: Record<string, number>; transit: TransitTransfer[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<{ from?: string; to?: string; lines?: string }>({});
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState<string | null>(null);
  const [got, setGot] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.variantId, o])), [options]);
  const label = (n: Named) => pick(locale, n.name, n.name_local);
  const nameOf = (id: string) => { const n = locations.find((x) => x.id === id); return n ? label(n) : "—"; };
  const optionName = (o: ReceiveOption) => {
    const item = pick(locale, o.itemName, o.itemNameLocal);
    return o.variantName ? `${item} · ${pick(locale, o.variantName, o.variantNameLocal)}` : item;
  };
  const avail = (id: string) => balances[`${from}|${id}`] ?? 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !from) return [];
    const used = new Set(lines.map((l) => l.variantId));
    return options.filter((o) => !used.has(o.variantId) && (balances[`${from}|${o.variantId}`] ?? 0) > 0 &&
      [o.itemName, o.itemNameLocal, o.variantName, o.variantNameLocal, o.sku, o.barcode].some((x) => x && x.toLowerCase().includes(q))).slice(0, 8);
  }, [query, options, lines, from, balances]);

  function errMsg(code: string | undefined, message: string | undefined, fallback: string) {
    if (code === "42501") return t("sk.forbidden");
    if (message === "insufficient_stock") return t("sk.tr.tooMuch");
    if (message === "transfer_closed") return t("sk.tr.closed");
    if (message === "same_location") return t("sk.tr.sameLocation");
    return code === "P0001" ? fallback : t("sk.saveError");
  }

  async function send() {
    const e: typeof errors = {};
    if (!from) e.from = t("sk.mv.locationRequired");
    if (!to) e.to = t("sk.mv.locationRequired");
    if (from && to && from === to) e.to = t("sk.tr.sameLocation");
    if (e.from || e.to) return setErrors(e);
    if (!lines.length) return setErrors({ lines: t("sk.mv.noLines") });
    const parsed = lines.map((l) => ({ variant_id: l.variantId, qty: Number(l.qty) }));
    if (parsed.some((l) => !Number.isFinite(l.qty) || l.qty <= 0)) return setErrors({ lines: t("sk.tr.qtyInvalid") });
    if (parsed.some((l) => l.qty > avail(l.variant_id))) return setErrors({ lines: t("sk.tr.tooMuch") });
    setBusy(true);
    const { error } = await createClient().rpc("send_transfer", { p_request_id: requestId, p_from: from, p_to: to, p_note: note.trim() || null, p_lines: parsed });
    setBusy(false);
    if (error) return toast("error", errMsg(error.code, error.message, t("sk.tr.failed")));
    toast("success", t("sk.tr.done"));
    setLines([]); setNote(""); setQuery(""); setErrors({});
    setRequestId(crypto.randomUUID());
    router.refresh();
  }

  async function receive(tr: TransitTransfer) {
    const parsed = tr.lines.map((l) => ({ variant_id: l.variantId, received: Number(got[`${tr.id}|${l.variantId}`] ?? l.qty) }));
    if (parsed.some((l, i) => !Number.isFinite(l.received) || l.received < 0 || l.received > tr.lines[i].qty)) return toast("error", t("sk.tr.receiveInvalid"));
    setActing(tr.id);
    const { error } = await createClient().rpc("receive_transfer", { p_transfer_id: tr.id, p_lines: parsed });
    setActing(null);
    if (error) { if (error.message === "transfer_closed") router.refresh(); return toast("error", errMsg(error.code, error.message, t("sk.tr.failed"))); }
    toast("success", t("sk.tr.receiveDone")); setOpen(null); router.refresh();
  }

  async function cancel(tr: TransitTransfer) {
    setActing(tr.id);
    const { error } = await createClient().rpc("cancel_transfer", { p_transfer_id: tr.id });
    setActing(null);
    if (error) { if (error.message === "transfer_closed") router.refresh(); return toast("error", errMsg(error.code, error.message, t("sk.tr.failed"))); }
    toast("success", t("sk.tr.cancelDone")); setOpen(null); router.refresh();
  }

  return (
    <>
      <section aria-label={t("sk.tr.title")} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
        <div>
          <h2 className="text-lg font-bold">{t("sk.tr.title")}</h2>
          <p className="mt-1 text-muted">{t("sk.tr.hint")}</p>
        </div>
        <Select label={t("sk.tr.from")} value={from} error={errors.from} onChange={(e) => { setFrom(e.target.value); setLines([]); setErrors({}); }}>
          <option value="">—</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
        </Select>
        <Select label={t("sk.tr.to")} value={to} error={errors.to} onChange={(e) => { setTo(e.target.value); setErrors({}); }}>
          <option value="">—</option>
          {locations.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
        </Select>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[14px] font-semibold text-ink-2">{t("sk.mv.lines")}</legend>
          <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} disabled={!from} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.mv.search")} aria-label={t("sk.mv.search")}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
          {query.trim() && from && (matches.length === 0
            ? <p className="text-muted">{t("sk.mv.searchEmpty")}</p>
            : <ul className="overflow-hidden rounded-card border border-line">
              {matches.map((o) => (
                <li key={o.variantId} className="border-t border-line first:border-t-0">
                  <button type="button" aria-label={fill(t("sk.mv.add"), { name: optionName(o) })}
                    onClick={() => { setLines((l) => [...l, { variantId: o.variantId, qty: "" }]); setQuery(""); setErrors({}); }}
                    className="flex min-h-14 w-full items-center gap-3 px-3 text-start transition-colors hover:bg-primary-soft">
                    <Plus className="size-5 shrink-0 text-link" aria-hidden />
                    <span className="min-w-0 flex-1 leading-snug"><b className="block break-words">{optionName(o)}</b>
                      <small className="text-muted">{fill(t("sk.tr.available"), { qty: qtyText(locale, avail(o.variantId)), unit: o.uom })}</small></span>
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
                <small className="text-muted">{fill(t("sk.tr.available"), { qty: qtyText(locale, avail(l.variantId)), unit: o.uom })}</small>
                <Input label={fill(t("sk.tr.qty"), { unit: o.uom })} type="number" inputMode="decimal" min={0} step="any" value={l.qty}
                  onChange={(e) => { setLines((x) => x.map((y) => (y.variantId === l.variantId ? { ...y, qty: e.target.value } : y))); setErrors({}); }} />
              </div>
            );
          })}
          {errors.lines && <p role="alert" className="text-danger">{errors.lines}</p>}
        </fieldset>
        <Textarea label={t("sk.mv.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <Button variant="primary" loading={busy} onClick={send}>{t("sk.tr.submit")}</Button>
      </section>

      <section aria-label={t("sk.tr.transit")} className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{t("sk.tr.transit")}</h2>
        {transit.length === 0 ? <p className="text-muted">{t("sk.tr.transitEmpty")}</p> : (
          <ul className="flex flex-col gap-3">
            {transit.map((tr) => (
              <li key={tr.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 leading-snug">
                <b className="break-words">{fill(t("sk.tr.route"), { from: nameOf(tr.fromId), to: nameOf(tr.toId) })}</b>
                <small className="text-muted">{fill(t("sk.tr.sentOn"), { date: new Date(tr.sentAt).toLocaleString(locale) })}{tr.note ? ` · ${tr.note}` : ""}</small>
                <ul className="text-ink-2">
                  {tr.lines.map((l) => { const o = byId.get(l.variantId); return (
                    <li key={l.variantId} className="break-words">{o ? optionName(o) : "—"} · {qtyText(locale, l.qty)} {o?.uom ?? ""}</li>
                  ); })}
                </ul>
                {open === tr.id ? (
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    <p className="text-muted">{t("sk.tr.receiveHint")}</p>
                    {tr.lines.map((l) => { const o = byId.get(l.variantId); const k = `${tr.id}|${l.variantId}`; return (
                      <Input key={k} label={`${o ? optionName(o) : "—"} — ${fill(t("sk.tr.receiveQty"), { unit: o?.uom ?? "" })}`} type="number" inputMode="decimal" min={0} step="any"
                        value={got[k] ?? String(l.qty)} onChange={(e) => setGot((g) => ({ ...g, [k]: e.target.value }))} />
                    ); })}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" loading={acting === tr.id} onClick={() => receive(tr)}>{t("sk.tr.receiveSubmit")}</Button>
                      <Button variant="secondary" onClick={() => setOpen(null)}>{t("sk.tr.close")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="primary" onClick={() => setOpen(tr.id)}>{t("sk.tr.receive")}</Button>
                    <Button variant="secondary" loading={acting === tr.id} onClick={() => cancel(tr)}>{t("sk.tr.cancel")}</Button>
                  </div>
                )}
                <small className="text-muted">{fill(t("sk.tr.cancelHint"), { from: nameOf(tr.fromId) })}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
