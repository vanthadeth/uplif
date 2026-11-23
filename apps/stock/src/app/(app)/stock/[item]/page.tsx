import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemStockView, type ItemLevel, type ItemMove } from "@/components/item-stock-view";

export const dynamic = "force-dynamic";

export default async function ItemStockPage({ params }: { params: Promise<{ item: string }> }) {
  const { item: itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const supabase = await createClient();
  const [item, variants, locs] = await Promise.all([
    supabase.from("items").select("id, name, name_local, sku, base_uom, reorder_level, kind").eq("id", itemId).maybeSingle(),
    supabase.from("item_variants").select("id, name, name_local, is_default, is_active").eq("item_id", itemId),
    supabase.from("locations").select("id, name, name_local"),
  ]);
  if (!item.data) notFound();
  const vids = (variants.data ?? []).map((v) => v.id);
  const [bal, ledger] = vids.length ? await Promise.all([
    supabase.from("stock_balances").select("location_id, variant_id, qty").in("variant_id", vids),
    supabase.from("stock_ledger").select("id, movement_id, location_id, variant_id, qty_delta, created_at").in("variant_id", vids).order("created_at", { ascending: false }).limit(30),
  ]) : [{ data: [] }, { data: [] }];
  const mids = [...new Set((ledger.data ?? []).map((l) => l.movement_id))];
  const moves = mids.length ? (await supabase.from("stock_movements").select("id, kind, reason, transfer_step, reference").in("id", mids)).data ?? [] : [];
  const m = new Map(moves.map((x) => [x.id, x]));
  const v = new Map((variants.data ?? []).map((x) => [x.id, x]));
  const l = new Map((locs.data ?? []).map((x) => [x.id, x]));

  const levels: ItemLevel[] = (bal.data ?? []).flatMap((b) => {
    const va = v.get(b.variant_id), lo = l.get(b.location_id);
    if (!va || !lo || Number(b.qty) <= 0) return [];
    return [{ key: `${b.location_id}:${b.variant_id}`, variantName: va.is_default ? null : va.name, variantNameLocal: va.is_default ? null : va.name_local,
      locationName: lo.name, locationNameLocal: lo.name_local, qty: Number(b.qty) }];
  });
  const history: ItemMove[] = (ledger.data ?? []).flatMap((x) => {
    const mv = m.get(x.movement_id), va = v.get(x.variant_id), lo = l.get(x.location_id);
    if (!mv || !va) return [];
    return [{ id: x.id, kind: mv.kind, reason: mv.reason, step: mv.transfer_step, reference: mv.reference, at: x.created_at, qty: Number(x.qty_delta),
      variantName: va.is_default ? null : va.name, variantNameLocal: va.is_default ? null : va.name_local, locationName: lo?.name ?? "—", locationNameLocal: lo?.name_local ?? null }];
  });
  const i = item.data;
  return <ItemStockView name={i.name} nameLocal={i.name_local} sku={i.sku} uom={i.base_uom} reorder={i.reorder_level === null ? null : Number(i.reorder_level)} levels={levels} history={history} />;
}
