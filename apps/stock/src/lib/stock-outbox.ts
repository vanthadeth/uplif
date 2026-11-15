import { createOutbox, isNetworkError, type OutboxItem } from "@uplif/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Stock changes that may be saved on the phone when there is no signal. Each one carries its own request id, so sending twice never counts twice. */
export type StockJob = {
  fn: "receive_stock" | "adjust_stock" | "send_transfer" | "receive_transfer";
  kind: "receive" | "adjust" | "count" | "transfer" | "arrival";
  args: Record<string, unknown>;
};

export const stockOutbox = createOutbox<StockJob>("stock");
export type StockItem = OutboxItem<StockJob>;

export type FlushResult = { sent: number; failed: number; stalled: boolean };
let flushing: Promise<FlushResult> | null = null;

/** Sends the saved changes of one person, oldest first. Stops at the first connection problem and tries again later. */
export function flushStockOutbox(supabase: SupabaseClient, owner: string): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const res: FlushResult = { sent: 0, failed: 0, stalled: false };
    for (const it of (await stockOutbox.list(owner)).filter((i) => i.status === "pending")) {
      const { error } = await supabase.rpc(it.data.fn, it.data.args as never);
      if (error) {
        if (isNetworkError(error)) { res.stalled = true; break; }
        await stockOutbox.update(it.id, { status: "failed", error: error.message }); res.failed++;
        continue;
      }
      await stockOutbox.remove(it.id);
      res.sent++;
    }
    return res;
  })().finally(() => { flushing = null; });
  return flushing;
}
