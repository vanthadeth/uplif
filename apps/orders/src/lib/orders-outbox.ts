import { createOutbox, isNetworkError, type OutboxItem } from "@uplif/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Orders changes that may be saved on the phone when there is no signal. Each one carries its own request id, so sending twice never counts twice. */
export type OrdersJob = {
  fn: "customers_create" | "customers_save_profile";
  kind: "customer";
  args: Record<string, unknown>;
};

export const ordersOutbox = createOutbox<OrdersJob>("orders");
export type OrdersItem = OutboxItem<OrdersJob>;

export type FlushResult = { sent: number; failed: number; stalled: boolean };
let flushing: Promise<FlushResult> | null = null;

/** Sends the saved changes of one person, oldest first. Stops at the first connection problem and tries again later. */
export function flushOrdersOutbox(supabase: SupabaseClient, owner: string): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const res: FlushResult = { sent: 0, failed: 0, stalled: false };
    for (const it of (await ordersOutbox.list(owner)).filter((i) => i.status === "pending")) {
      const { error } = await supabase.rpc(it.data.fn, it.data.args as never);
      if (error) {
        if (isNetworkError(error)) { res.stalled = true; break; }
        await ordersOutbox.update(it.id, { status: "failed", error: error.message }); res.failed++;
        continue;
      }
      await ordersOutbox.remove(it.id);
      res.sent++;
    }
    return res;
  })().finally(() => { flushing = null; });
  return flushing;
}
