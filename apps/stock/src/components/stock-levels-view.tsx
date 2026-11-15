"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick, qtyText } from "@/lib/format";

export interface LevelRow {
  key: string; itemId: string; itemName: string; itemNameLocal: string | null; sku: string | null; uom: string;
  variantName: string | null; variantNameLocal: string | null; locationName: string; locationNameLocal: string | null; qty: number;
}

export interface WatchedItem { itemId: string; name: string; nameLocal: string | null; sku: string | null; uom: string; level: number }

/** What you have: each item (and variant) with its quantity in every location, and the total. */
export function StockLevelsView({ rows, watch, failed }: { rows: LevelRow[]; watch: WatchedItem[]; failed: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const levelOf = useMemo(() => new Map(watch.map((w) => [w.itemId, w.level])), [watch]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { name: string; sku: string | null; uom: string; rows: LevelRow[] }>();
    // Watched items with nothing in stock have no rows; show them as empty groups.
    for (const w of watch) {
      if (rows.some((r) => r.itemId === w.itemId)) continue;
      if (q && ![w.name, w.nameLocal, w.sku].some((x) => x && x.toLowerCase().includes(q))) continue;
      map.set(w.itemId, { name: pick(locale, w.name, w.nameLocal), sku: w.sku, uom: w.uom, rows: [] });
    }
    for (const r of rows) {
      const name = pick(locale, r.itemName, r.itemNameLocal);
      if (q && ![r.itemName, r.itemNameLocal, r.variantName, r.sku].some((x) => x && x.toLowerCase().includes(q))) continue;
      const g = map.get(r.itemId) ?? { name, sku: r.sku, uom: r.uom, rows: [] };
      g.rows.push(r);
      map.set(r.itemId, g);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, locale)).map(([id, g]) => ({ id, ...g, total: g.rows.reduce((s, r) => s + r.qty, 0) }))
      .map((g) => ({ ...g, level: levelOf.get(g.id) ?? null }))
      .filter((g) => !lowOnly || (g.level !== null && g.total <= g.level));
  }, [rows, watch, query, lowOnly, locale, levelOf]);

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.lv.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.lv.subtitle")}</p>
      </div>
      {failed ? (
        <ErrorState title={t("sk.lv.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : rows.length === 0 && watch.length === 0 ? (
        <EmptyState title={t("sk.lv.empty")} body={t("sk.lv.emptyBody")} />
      ) : (
        <>
          <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.lv.search")} aria-label={t("sk.lv.search")}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
          {watch.length > 0 && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="size-5" />
              <span>{t("sk.lv.lowOnly")}</span>
            </label>
          )}
          {groups.length === 0 ? <p className="py-8 text-center text-muted">{lowOnly && !query.trim() ? t("sk.lv.noLow") : t("sk.lv.noMatch")}</p> : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id} className="rounded-card border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/stock/${g.id}`} className="block min-w-0 break-words font-bold text-link">{g.name}</Link>
                    {g.level !== null && g.total <= g.level && <Badge tone={g.total <= 0 ? "danger" : "warning"}>{g.total <= 0 ? t("sk.lv.out") : t("sk.lv.low")}</Badge>}
                  </div>
                  <small className="block text-muted">{[g.sku, fill(t("sk.lv.total"), { qty: qtyText(locale, g.total), unit: g.uom }), g.level !== null ? fill(t("sk.lv.reorderAt"), { qty: qtyText(locale, g.level), unit: g.uom }) : null].filter(Boolean).join(" · ")}</small>
                  <ul className="mt-2 divide-y divide-line">
                    {g.rows.map((r) => (
                      <li key={r.key} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 break-words">{r.variantName ? `${pick(locale, r.variantName, r.variantNameLocal)} · ` : ""}{pick(locale, r.locationName, r.locationNameLocal)}</span>
                        <b className="shrink-0 tabular-nums">{qtyText(locale, r.qty)} {r.uom}</b>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
