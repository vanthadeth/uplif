"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { EmptyState, ErrorState, SidePanel, Skeleton, Tabs } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { money, pick } from "@/lib/format";

interface Change { id: string; at: string; who: string | null; variant: string | null; from: number | null; to: number | null; currency: string }
type Kind = "price" | "cost";
const PAGE = 100;

/** Every change to an item's selling price and (for people who may see cost) its cost, newest first. */
export function PriceHistorySheet({ item, canViewCost, onClose }: {
  item: { id: string; name: string; name_local: string | null } | null; canViewCost: boolean; onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<Kind>("price");
  const [rows, setRows] = useState<Record<Kind, Change[] | null>>({ price: null, cost: null });
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!item) return;
    let live = true;
    setRows({ price: null, cost: null }); setFailed(false); setKind("price");
    (async () => {
      const supabase = createClient();
      const [p, c] = await Promise.all([
        supabase.from("price_history").select("id, changed_at, changed_by_name, variant_name, old_price, new_price, currency_code").eq("item_id", item.id).order("changed_at", { ascending: false }).limit(PAGE),
        canViewCost
          ? supabase.from("cost_history").select("id, changed_at, changed_by_name, variant_name, old_cost, new_cost, currency_code").eq("item_id", item.id).order("changed_at", { ascending: false }).limit(PAGE)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!live) return;
      if (p.error || c.error) return setFailed(true);
      setRows({
        price: (p.data ?? []).map((r) => ({ id: r.id, at: r.changed_at, who: r.changed_by_name, variant: r.variant_name, from: r.old_price === null ? null : Number(r.old_price), to: r.new_price === null ? null : Number(r.new_price), currency: r.currency_code })),
        cost: ((c.data ?? []) as { id: string; changed_at: string; changed_by_name: string | null; variant_name: string | null; old_cost: number | null; new_cost: number | null; currency_code: string }[])
          .map((r) => ({ id: r.id, at: r.changed_at, who: r.changed_by_name, variant: r.variant_name, from: r.old_cost === null ? null : Number(r.old_cost), to: r.new_cost === null ? null : Number(r.new_cost), currency: r.currency_code })),
      });
    })();
    return () => { live = false; };
  }, [item, canViewCost, tries]);

  const list = rows[kind];
  const amount = (n: number | null, cur: string) => (n === null ? "–" : money(locale, n, cur));
  return (
    <SidePanel sheet open={item !== null} onClose={onClose} closeLabel={t("sk.close")}
      title={item ? `${t("sk.hist.title")}: ${pick(locale, item.name, item.name_local)}` : t("sk.hist.title")}>
      <div className="flex flex-col gap-4">
        {canViewCost && (
          <Tabs label={t("sk.hist.title")} value={kind} onChange={(k) => setKind(k as Kind)}
            items={[{ id: "price", label: t("sk.hist.price") }, { id: "cost", label: t("sk.hist.cost") }]} />
        )}
        {failed ? (
          <ErrorState title={t("sk.hist.loadError")} action={<button type="button" className="min-h-11 font-semibold text-link" onClick={() => setTries((n) => n + 1)}>{t("sk.retry")}</button>} />
        ) : list === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2].map((n) => <Skeleton key={n} className="h-16 w-full" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState title={t("sk.hist.empty")} body={t("sk.hist.emptyBody")} />
        ) : (
          <ul role="tabpanel" className="overflow-hidden rounded-card border border-line bg-surface">
            {list.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 border-t border-line p-3 leading-snug first:border-t-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  <span>{amount(r.from, r.currency)}</span><ArrowRight className="size-4 shrink-0 text-muted" aria-hidden /><span>{r.to === null ? t(kind === "price" ? "sk.hist.itemPrice" : "sk.hist.removed") : amount(r.to, r.currency)}</span>
                </span>
                <small className="break-words text-muted">{r.variant ?? t("sk.hist.wholeItem")}</small>
                <small className="break-words text-muted">{new Date(r.at).toLocaleString(locale)}{r.who ? ` · ${r.who}` : ""}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SidePanel>
  );
}
