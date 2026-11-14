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
type Line = { variantId: string; counted: string };
const REASONS = ["count", "damage", "loss", "found", "other"] as const;

/** Adjust stock: type what you counted; the system shows the difference and writes it to the ledger with a reason. */
export function AdjustForm({ locations, options, balances }: { locations: Named[]; options: ReceiveOption[]; balances: Record<string, number> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [location, setLocation] = useState(locations.length === 1 ? locations[0].id : "");
  const [reason, setReason] = useState("count");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<{ location?: string; lines?: string }>({});
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const byId = useMemo(() => new Map(options.map((o) => [o.variantId, o])), [options]);
  const label = (n: Named) => pick(locale, n.name, n.name_local);
  const optionName = (o: ReceiveOption) => {
    const item = pick(locale, o.itemName, o.itemNameLocal);
    return o.variantName ? `${item} · ${pick(locale, o.variantName, o.variantNameLocal)}` : item;
  };
  const system = (id: string) => balances[`${location}|${id}`] ?? 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const used = new Set(lines.map((l) => l.variantId));
    return options.filter((o) => !used.has(o.variantId) &&
      [o.itemName, o.itemNameLocal, o.variantName, o.variantNameLocal, o.sku, o.barcode].some((x) => x && x.toLowerCase().includes(q))).slice(0, 8);
  }, [query, options, lines]);

  async function submit() {
    if (!location) return setErrors({ location: t("sk.mv.locationRequired") });
    if (!lines.length) return setErrors({ lines: t("sk.mv.noLines") });
    const parsed = lines.map((l) => ({ variant_id: l.variantId, counted: l.counted.trim() === "" ? NaN : Number(l.counted) }));
    if (parsed.some((l) => !Number.isFinite(l.counted) || l.counted < 0)) return setErrors({ lines: t("sk.ad.countedInvalid") });
    if (parsed.every((l) => l.counted === system(l.variant_id))) return setErrors({ lines: t("sk.ad.noChange") });
    setBusy(true);
    const { error } = await createClient().rpc("adjust_stock", {
      p_request_id: requestId, p_location_id: location, p_reason: reason, p_note: note.trim() || null, p_lines: parsed,
    });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : error.message === "no_change" ? t("sk.ad.noChange") : error.code === "P0001" ? t("sk.ad.failed") : t("sk.saveError"));
    toast("success", t("sk.ad.done"));
    setLines([]); setNote(""); setQuery(""); setErrors({}); setReason("count");
    setRequestId(crypto.randomUUID());
    router.refresh();
  }

  return (
    <section aria-label={t("sk.ad.title")} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="text-lg font-bold">{t("sk.ad.title")}</h2>
        <p className="mt-1 text-muted">{t("sk.ad.hint")}</p>
      </div>
      <Select label={t("sk.ad.location")} value={location} error={errors.location} onChange={(e) => { setLocation(e.target.value); setErrors({}); }}>
        <option value="">—</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
      </Select>
      <Select label={t("sk.ad.reason")} value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => <option key={r} value={r}>{t(`sk.ad.reason.${r}` as never)}</option>)}
      </Select>

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
                <button type="button" aria-label={fill(t("sk.mv.add"), { name: optionName(o) })}
                  onClick={() => { setLines((l) => [...l, { variantId: o.variantId, counted: "" }]); setQuery(""); setErrors({}); }}
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
          const sys = system(l.variantId);
          const has = l.counted.trim() !== "" && Number.isFinite(Number(l.counted));
          const diff = has ? Number(l.counted) - sys : 0;
          return (
            <div key={l.variantId} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <div className="flex items-start gap-2">
                <b className="min-w-0 flex-1 break-words leading-snug">{optionName(o)}</b>
                <button type="button" aria-label={fill(t("sk.mv.removeLine"), { name: optionName(o) })} onClick={() => setLines((x) => x.filter((y) => y.variantId !== l.variantId))}
                  className="grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
              </div>
              <small className="text-muted">{location ? fill(t("sk.ad.system"), { qty: qtyText(locale, sys), unit: o.uom }) : ""}</small>
              <Input label={fill(t("sk.ad.counted"), { unit: o.uom })} type="number" inputMode="decimal" min={0} step="any" value={l.counted}
                onChange={(e) => { setLines((x) => x.map((y) => (y.variantId === l.variantId ? { ...y, counted: e.target.value } : y))); setErrors({}); }} />
              {has && location && (
                <small className={diff === 0 ? "text-muted" : diff > 0 ? "font-semibold text-success-ink" : "font-semibold text-danger"}>
                  {diff === 0 ? t("sk.ad.same") : fill(t("sk.ad.diff"), { diff: `${diff > 0 ? "+" : ""}${qtyText(locale, diff)}` })}
                </small>
              )}
            </div>
          );
        })}
        {errors.lines && <p role="alert" className="text-danger">{errors.lines}</p>}
      </fieldset>

      <Textarea label={t("sk.mv.note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <Button variant="primary" loading={busy} onClick={submit}>{t("sk.ad.submit")}</Button>
    </section>
  );
}
