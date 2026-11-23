"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Select, downloadCsv, toCsv } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { pick, qtyText } from "@/lib/format";

export interface HistoryRow {
  id: string; kind: string; reason: string | null; step: string | null; reference: string | null; at: string; qty: number; uom: string;
  itemName: string; itemNameLocal: string | null; variantName: string | null; variantNameLocal: string | null;
  locationId: string; locationName: string; locationNameLocal: string | null;
}
interface Loc { id: string; name: string; name_local: string | null }

/** Every change to stock, newest first. One line per item per movement; filter by type, location or item. */
export function HistoryView({ rows, locations, more, nextLimit, failed }: { rows: HistoryRow[]; locations: Loc[]; more: boolean; nextLimit: number; failed: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!kind || r.kind === kind) && (!location || r.locationId === location) &&
      (!q || [r.itemName, r.itemNameLocal, r.variantName, r.variantNameLocal, r.reference].some((x) => x && x.toLowerCase().includes(q))));
  }, [rows, kind, location, query]);

  const label = (r: HistoryRow) => {
    if (r.kind === "transfer") return `${t("sk.mv.kindTransfer")}${r.step ? ` · ${t(`sk.tr.step.${r.step}` as never)}` : ""}`;
    if (r.kind === "adjust") return `${t("sk.mv.kindAdjust")}${r.reason ? ` · ${t(`sk.ad.reason.${r.reason}` as never)}` : ""}`;
    return t("sk.mv.kindReceive");
  };

  function exportCsv() {
    downloadCsv("uplif-stock-history.csv", toCsv(
      ["date", "type", "reason", "step", "item", "variant", "location", "qty_change", "unit", "reference"],
      shown.map((r) => [r.at, r.kind, r.reason, r.step, r.itemName, r.variantName, r.locationName, r.qty, r.uom, r.reference])));
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/move" className="mb-2 inline-flex min-h-11 items-center gap-1 text-link"><ArrowLeft className="size-[18px]" aria-hidden />{t("sk.hi.back")}</Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.hi.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.hi.subtitle")}</p>
      </div>
      {failed ? <ErrorState title={t("sk.hi.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
        : rows.length === 0 ? <EmptyState title={t("sk.hi.empty")} body={t("sk.hi.emptyBody")} /> : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t("sk.hi.kind")} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">{t("sk.hi.allKinds")}</option>
                <option value="receive">{t("sk.mv.kindReceive")}</option>
                <option value="adjust">{t("sk.mv.kindAdjust")}</option>
                <option value="transfer">{t("sk.mv.kindTransfer")}</option>
              </Select>
              <Select label={t("sk.hi.location")} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">{t("sk.hi.allLocations")}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{pick(locale, l.name, l.name_local)}</option>)}
              </Select>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.hi.search")} aria-label={t("sk.hi.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            {shown.length > 0 && <div><Button onClick={exportCsv}><Download className="size-[18px]" aria-hidden />{t("sk.ex.button")}</Button></div>}
            {shown.length === 0 ? <p className="py-8 text-center text-muted">{t("sk.hi.noMatch")}</p> : (
              <ul className="overflow-hidden rounded-card border border-line bg-surface">
                {shown.map((r) => {
                  const item = pick(locale, r.itemName, r.itemNameLocal);
                  const name = r.variantName ? `${item} · ${pick(locale, r.variantName, r.variantNameLocal)}` : item;
                  return (
                    <li key={r.id} className="flex min-h-16 items-center gap-3 border-t border-line p-3 first:border-t-0">
                      <div className="min-w-0 flex-1 leading-snug">
                        <b className="block break-words">{name}</b>
                        <small className="block text-muted">{label(r)} · {pick(locale, r.locationName, r.locationNameLocal)}{r.reference ? ` · ${r.reference}` : ""}</small>
                        <small className="block text-muted">{new Date(r.at).toLocaleString(locale)}</small>
                      </div>
                      <Badge tone={r.qty > 0 ? "success" : "warning"}>{r.qty > 0 ? "+" : "−"}{qtyText(locale, Math.abs(r.qty))} {r.uom}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {more && <Button onClick={() => router.push(`/history?n=${nextLimit}`)}>{t("sk.hi.more")}</Button>}
          </>
        )}
    </main>
  );
}
