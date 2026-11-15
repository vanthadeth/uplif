import { createClient } from "@/lib/supabase/server";
import { getStockState } from "@/lib/stock-state";
import { MoveView, type ReceiveOption } from "@/components/move-view";

export const dynamic = "force-dynamic";

export default async function MovePage() {
  const [state, supabase] = await Promise.all([getStockState(), createClient()]);
  const [locations, suppliers, items, variants, moves, bal, transfers, writable] = await Promise.all([
    supabase.from("locations").select("id, name, name_local").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id, name, name_local").order("name"),
    supabase.from("items").select("id, sku, name, name_local, base_uom, packs").eq("is_active", true).eq("kind", "stocked").order("name"),
    supabase.from("item_variants").select("id, item_id, name, name_local, sku, barcode, is_default").eq("is_active", true),
    supabase.from("stock_movements").select("id, kind, reason, transfer_step, location_id, supplier_id, reference, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("stock_balances").select("location_id, variant_id, qty").limit(5000),
    supabase.from("stock_transfers").select("id, from_location_id, to_location_id, sent_at, note, stock_transfer_lines(variant_id, qty_sent)").eq("status", "sent").order("sent_at", { ascending: false }).limit(50),
    supabase.rpc("stock_writable_locations"),
  ]);
  const ids = (moves.data ?? []).map((m) => m.id);
  const lines = ids.length ? (await supabase.from("stock_ledger").select("movement_id").in("movement_id", ids)).data ?? [] : [];
  const lineCount: Record<string, number> = {};
  for (const l of lines) lineCount[l.movement_id] = (lineCount[l.movement_id] ?? 0) + 1;

  const balances: Record<string, number> = {};
  for (const b of bal.data ?? []) balances[`${b.location_id}|${b.variant_id}`] = Number(b.qty);

  // One entry per thing you can receive: the item itself, or each of its variants when it has some.
  const byItem = new Map<string, typeof variants.data>();
  for (const v of variants.data ?? []) byItem.set(v.item_id, [...(byItem.get(v.item_id) ?? []), v]);
  const options: ReceiveOption[] = (items.data ?? []).flatMap((i) => {
    const vs = byItem.get(i.id) ?? [];
    const real = vs.filter((v) => !v.is_default);
    const use = real.length ? real : vs;
    const packs = Array.isArray(i.packs) ? (i.packs as unknown as { name: string; qty: number }[]) : [];
    return use.map((v) => ({
      variantId: v.id, itemName: i.name, itemNameLocal: i.name_local, variantName: v.is_default ? null : v.name,
      variantNameLocal: v.is_default ? null : v.name_local, sku: v.sku ?? i.sku, barcode: v.barcode, uom: i.base_uom, packs,
    }));
  });
  return (
    <MoveView
      locations={locations.data ?? []} suppliers={suppliers.data ?? []} options={options} balances={balances} writableIds={(writable.data as unknown as string[] | null) ?? []}
      transit={(transfers.data ?? []).map((x) => ({ id: x.id, fromId: x.from_location_id, toId: x.to_location_id, sentAt: x.sent_at, note: x.note, lines: (x.stock_transfer_lines ?? []).map((l) => ({ variantId: l.variant_id, qty: Number(l.qty_sent) })) }))}
      recent={(moves.data ?? []).map((m) => ({ ...m, lines: lineCount[m.id] ?? 0 }))}
      failed={!!locations.error || !!items.error || !!moves.error} canMove={state!.canMove}
    />
  );
}
