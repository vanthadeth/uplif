"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick, qtyText } from "@/lib/format";

export interface ItemLevel { key: string; variantName: string | null; variantNameLocal: string | null; locationName: string; locationNameLocal: string | null; qty: number }
export interface ItemMove {
  id: string; kind: string; reason: string | null; step: string | null; reference: string | null; at: string; qty: number;
  variantName: string | null; variantNameLocal: string | null; locationName: string; locationNameLocal: string | null;
}

/** One item: how much is where, whether it is low, and its latest movements. */
export function ItemStockView({ name, nameLocal, sku, uom, reorder, levels, history }: {
  name: string; nameLocal: string | null; sku: string | null; uom: string; reorder: number | null; levels: ItemLevel[]; history: ItemMove[];
}) {
  const { t, locale } = useI18n();
  const total = levels.reduce((s, r) => s + r.qty, 0);
  const low = reorder !== null && total <= reorder;
  const label = (r: ItemMove) => {
    if (r.kind === "transfer") return `${t("sk.mv.kindTransfer")}${r.step ? ` · ${t(`sk.tr.step.${r.step}` as never)}` : ""}`;
    if (r.kind === "adjust") return `${t("sk.mv.kindAdjust")}${r.reason ? ` · ${t(`sk.ad.reason.${r.reason}` as never)}` : ""}`;
    return t("sk.mv.kindReceive");
  };
  const variantLabel = (a: string | null, b: string | null) => (a ? `${pick(locale, a, b)} · ` : "");
  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/stock" className="mb-2 inline-flex min-h-11 items-center gap-1 text-link"><ArrowLeft className="size-[18px]" aria-hidden />{t("sk.id.back")}</Link>
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">{pick(locale, name, nameLocal)}</h1>
          {low && <Badge tone={total <= 0 ? "danger" : "warning"}>{total <= 0 ? t("sk.lv.out") : t("sk.lv.low")}</Badge>}
        </div>
        <p className="mt-1 text-muted">{[sku, fill(t("sk.lv.total"), { qty: qtyText(locale, total), unit: uom }), reorder !== null ? fill(t("sk.lv.reorderAt"), { qty: qtyText(locale, reorder), unit: uom }) : null].filter(Boolean).join(" · ")}</p>
      </div>

      <section aria-label={t("sk.id.where")} className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{t("sk.id.where")}</h2>
        {levels.length === 0 ? <p className="text-muted">{t("sk.id.none")}</p> : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface px-3">
            {levels.map((r) => (
              <li key={r.key} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 break-words">{variantLabel(r.variantName, r.variantNameLocal)}{pick(locale, r.locationName, r.locationNameLocal)}</span>
                <b className="shrink-0 tabular-nums">{qtyText(locale, r.qty)} {uom}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("sk.id.recent")} className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{t("sk.id.recent")}</h2>
        {history.length === 0 ? <EmptyState title={t("sk.hi.empty")} body={t("sk.hi.emptyBody")} /> : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex min-h-16 items-center gap-3 border-t border-line p-3 first:border-t-0">
                <div className="min-w-0 flex-1 leading-snug">
                  <b className="block break-words">{label(r)} · {variantLabel(r.variantName, r.variantNameLocal)}{pick(locale, r.locationName, r.locationNameLocal)}</b>
                  <small className="block text-muted">{new Date(r.at).toLocaleString(locale)}{r.reference ? ` · ${r.reference}` : ""}</small>
                </div>
                <Badge tone={r.qty > 0 ? "success" : "warning"}>{r.qty > 0 ? "+" : "−"}{qtyText(locale, Math.abs(r.qty))} {uom}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link href="/history" className="inline-flex min-h-11 items-center text-link">{t("sk.hi.link")}</Link>
      </section>
    </main>
  );
}
