"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button, EmptyState, ErrorState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick, qtyText } from "@/lib/format";

export interface LevelRow {
  key: string; itemId: string; itemName: string; itemNameLocal: string | null; sku: string | null; uom: string;
  variantName: string | null; variantNameLocal: string | null; locationName: string; locationNameLocal: string | null; qty: number;
}

/** What you have: each item (and variant) with its quantity in every location, and the total. */
export function StockLevelsView({ rows, failed }: { rows: LevelRow[]; failed: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { name: string; sku: string | null; uom: string; rows: LevelRow[] }>();
    for (const r of rows) {
      const name = pick(locale, r.itemName, r.itemNameLocal);
      if (q && ![r.itemName, r.itemNameLocal, r.variantName, r.sku].some((x) => x && x.toLowerCase().includes(q))) continue;
      const g = map.get(r.itemId) ?? { name, sku: r.sku, uom: r.uom, rows: [] };
      g.rows.push(r);
      map.set(r.itemId, g);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, locale)).map(([id, g]) => ({ id, ...g, total: g.rows.reduce((s, r) => s + r.qty, 0) }));
  }, [rows, query, locale]);

  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.lv.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.lv.subtitle")}</p>
      </div>
      {failed ? (
        <ErrorState title={t("sk.lv.loadError")} action={<Button onClick={() => router.refresh()}>{t("sk.retry")}</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("sk.lv.empty")} body={t("sk.lv.emptyBody")} />
      ) : (
        <>
          <label className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sk.lv.search")} aria-label={t("sk.lv.search")}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
          {groups.length === 0 ? <p className="py-8 text-center text-muted">{t("sk.lv.noMatch")}</p> : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id} className="rounded-card border border-line bg-surface p-3">
                  <b className="block break-words">{g.name}</b>
                  <small className="block text-muted">{[g.sku, fill(t("sk.lv.total"), { qty: qtyText(locale, g.total), unit: g.uom })].filter(Boolean).join(" · ")}</small>
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
