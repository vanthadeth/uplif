"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { BarcodeScanner, Button, Input, ScanButton, Select, Textarea, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { scanLabels } from "@/lib/scan-labels";
import { pick, qtyText } from "@/lib/format";
import type { ReceiveOption } from "./move-view";

interface Named { id: string; name: string; name_local: string | null }
const MAX_LINES = 200; // adjust_stock takes at most this many lines in one go

/**
 * Count a whole location: every item with stock there is listed with the system quantity. Type what you counted for the
 * ones you checked; only the ones that differ are saved, as one adjustment with the reason "stock count".
 */
export function CountSheet({ locations, options, balances }: { locations: Named[]; options: ReceiveOption[]; balances: Record<string, number> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [location, setLocation] = useState(locations.length === 1 ? locations[0].id : "");
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const system = (id: string) => balances[`${location}|${id}`] ?? 0;
  const optionName = (o: ReceiveOption) => {
    const item = pick(locale, o.itemName, o.itemNameLocal);
    return o.variantName ? `${item} · ${pick(locale, o.variantName, o.variantNameLocal)}` : item;
  };
  const rows = useMemo(() => {
    if (!location) return [];
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => showAll || (balances[`${location}|${o.variantId}`] ?? 0) > 0 || counted[o.variantId] !== undefined)
      .filter((o) => !q || [o.itemName, o.itemNameLocal, o.variantName, o.variantNameLocal, o.sku, o.barcode].some((x) => x && x.toLowerCase().includes(q)))
      .sort((a, b) => optionName(a).localeCompare(optionName(b), locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, options, balances, showAll, query, counted, locale]);

  const changes = useMemo(() => options.flatMap((o) => {
    const text = counted[o.variantId];
    if (text === undefined || text.trim() === "") return [];
    const n = Number(text);
    return [{ variantId: o.variantId, counted: n, system: balances[`${location}|${o.variantId}`] ?? 0 }];
  }).filter((c) => !Number.isFinite(c.counted) || c.counted !== c.system), [options, counted, balances, location]);

  const setRow = (id: string, v: string) => { setCounted((c) => ({ ...c, [id]: v })); setError(""); };
  const reset = (loc: string) => { setLocation(loc); setCounted({}); setError(""); setRequestId(crypto.randomUUID()); };

  async function save() {
    if (!location) return setError(t("sk.mv.locationRequired"));
    if (changes.length === 0) return setError(t("sk.ct.noChanges"));
    if (changes.some((c) => !Number.isFinite(c.counted) || c.counted < 0)) return setError(t("sk.ad.countedInvalid"));
    const send = changes.slice(0, MAX_LINES);
    setBusy(true);
    const { error: err } = await createClient().rpc("adjust_stock", {
      p_request_id: requestId, p_location_id: location, p_reason: "count", p_note: note.trim() || null,
      p_lines: send.map((c) => ({ variant_id: c.variantId, counted: c.counted })),
    });
    setBusy(false);
    if (err) return toast("error", err.code === "42501" ? t("sk.forbidden") : err.message === "no_change" ? t("sk.ad.noChange") : err.code === "P0001" ? t("sk.ad.failed") : t("sk.saveError"));
    const left = changes.length - send.length;
    toast("success", fill(t("sk.ct.done"), { n: send.length }) + (left > 0 ? ` ${fill(t("sk.ct.more"), { n: left })}` : ""));
    // Saved rows leave the sheet (their system quantity is now what was counted); the rest stay for the next save.
    setCounted((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !send.some((s) => s.variantId === id))));
    setNote(""); setError(""); setRequestId(crypto.randomUUID());
    router.refresh();
  }

  return (
    <section aria-label={t("sk.ct.title")} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="text-lg font-bold">{t("sk.ct.title")}</h2>
        <p className="mt-1 text-muted">{t("sk.ct.hint")}</p>
      </div>
      <Select label={t("sk.ad.location")} value={location} onChange={(e) => reset(e.target.value)}>
        <option value="">—</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{pick(locale, l.name, l.name_local)}</option>)}
      </Select>
      {location && (
        <>
          <div className="flex items-center gap-2">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.mv.search")} aria-label={t("sk.mv.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            <ScanButton onClick={() => setScanning(true)} label={t("sk.scan.open")} />
          </div>
          <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onScan={setQuery} labels={scanLabels(t)} />
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-5" />
            <span>{t("sk.ct.showAll")}</span>
          </label>
          {rows.length === 0 ? <p className="py-4 text-center text-muted">{t("sk.ct.empty")}</p> : (
            <ul className="overflow-hidden rounded-card border border-line">
              {rows.map((o) => {
                const text = counted[o.variantId] ?? "";
                const n = text.trim() === "" ? null : Number(text);
                const diff = n !== null && Number.isFinite(n) ? n - system(o.variantId) : null;
                return (
                  <li key={o.variantId} className="flex flex-col gap-2 border-t border-line p-3 first:border-t-0">
                    <b className="break-words leading-snug">{optionName(o)}</b>
                    <small className="text-muted">{fill(t("sk.ct.system"), { qty: qtyText(locale, system(o.variantId)), unit: o.uom })}</small>
                    <div className="flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        <Input label={t("sk.ct.counted")} type="number" inputMode="decimal" min={0} step="any" value={text} onChange={(e) => setRow(o.variantId, e.target.value)} />
                      </div>
                      {diff !== null && diff !== 0 && <b className={diff < 0 ? "mb-2.5 text-danger" : "mb-2.5 text-success-ink"}>{diff > 0 ? "+" : "−"}{qtyText(locale, Math.abs(diff))}</b>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Textarea label={t("sk.mv.note")} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          {error && <p role="alert" className="text-danger">{error}</p>}
          <Button variant="primary" loading={busy} disabled={changes.length === 0} onClick={save}>{fill(t("sk.ct.changes"), { n: changes.length })}</Button>
        </>
      )}
    </section>
  );
}
