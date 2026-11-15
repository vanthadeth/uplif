import { createClient } from "@/lib/supabase/server";
import { HistoryView, type HistoryRow } from "@/components/history-view";

export const dynamic = "force-dynamic";
const STEP = 100;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const limit = Math.min(Math.max(Number(n) || STEP, STEP), 1000);
  const supabase = await createClient();
  // One more than shown tells us whether there is more to load.
  const ledger = await supabase.from("stock_ledger").select("id, movement_id, location_id, variant_id, qty_delta, created_at").order("created_at", { ascending: false }).limit(limit + 1);
  const lines = ledger.data ?? [];
  const more = lines.length > limit;
  const shown = lines.slice(0, limit);
  const mids = [...new Set(shown.map((l) => l.movement_id))];
  const vids = [...new Set(shown.map((l) => l.variant_id))];
  const [moves, variants, locs] = await Promise.all([
    mids.length ? supabase.from("stock_movements").select("id, kind, reason, transfer_step, reference").in("id", mids) : Promise.resolve({ data: [], error: null }),
    vids.length ? supabase.from("item_variants").select("id, item_id, name, name_local, is_default").in("id", vids) : Promise.resolve({ data: [], error: null }),
    supabase.from("locations").select("id, name, name_local"),
  ]);
  const iids = [...new Set((variants.data ?? []).map((v) => v.item_id))];
  const items = iids.length ? (await supabase.from("items").select("id, name, name_local, base_uom").in("id", iids)).data ?? [] : [];
  const m = new Map((moves.data ?? []).map((x) => [x.id, x]));
  const v = new Map((variants.data ?? []).map((x) => [x.id, x]));
  const i = new Map(items.map((x) => [x.id, x]));
  const l = new Map((locs.data ?? []).map((x) => [x.id, x]));
  const rows: HistoryRow[] = shown.flatMap((x) => {
    const mv = m.get(x.movement_id), va = v.get(x.variant_id), it = va && i.get(va.item_id), lo = l.get(x.location_id);
    if (!mv || !va || !it) return [];
    return [{
      id: x.id, kind: mv.kind, reason: mv.reason, step: mv.transfer_step, reference: mv.reference, at: x.created_at, qty: Number(x.qty_delta), uom: it.base_uom,
      itemName: it.name, itemNameLocal: it.name_local, variantName: va.is_default ? null : va.name, variantNameLocal: va.is_default ? null : va.name_local,
      locationId: x.location_id, locationName: lo?.name ?? "—", locationNameLocal: lo?.name_local ?? null,
    }];
  });
  return <HistoryView rows={rows} locations={locs.data ?? []} more={more} nextLimit={limit + STEP} failed={!!ledger.error} />;
}
