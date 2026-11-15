import { beforeEach, describe, expect, it, vi } from "vitest";

// The UI package index pulls in components; the outbox itself is plain code, so load just that file.
vi.mock("@uplif/ui", async () => await import("../../../../packages/ui/src/outbox"));

import { flushStockOutbox, stockOutbox, type StockJob } from "./stock-outbox";

const job = (n: number): StockJob => ({ fn: "adjust_stock", kind: "count", args: { p_request_id: `r${n}` } });
const fake = (answers: ({ message: string; code?: string } | null)[]) => {
  const calls: string[] = [];
  const supabase = { rpc: async (_fn: string, args: { p_request_id: string }) => { calls.push(args.p_request_id); return { error: answers.shift() ?? null }; } };
  return { supabase: supabase as never, calls };
};

describe("flushStockOutbox", () => {
  beforeEach(async () => { for (const i of await stockOutbox.list("u1")) await stockOutbox.remove(i.id); });

  it("sends in order and clears what the server took", async () => {
    await stockOutbox.add({ id: "a", owner: "u1", data: job(1) });
    await new Promise((r) => setTimeout(r, 2));
    await stockOutbox.add({ id: "b", owner: "u1", data: job(2) });
    const { supabase, calls } = fake([null, null]);
    expect(await flushStockOutbox(supabase, "u1")).toEqual({ sent: 2, failed: 0, stalled: false });
    expect(calls).toEqual(["r1", "r2"]);
    expect(await stockOutbox.list("u1")).toHaveLength(0);
  });
  it("stops on a connection problem and keeps everything", async () => {
    await stockOutbox.add({ id: "a", owner: "u1", data: job(1) });
    const { supabase } = fake([{ message: "TypeError: Failed to fetch" }]);
    expect((await flushStockOutbox(supabase, "u1")).stalled).toBe(true);
    expect((await stockOutbox.list("u1"))[0].status).toBe("pending");
  });
  it("marks a refused change as failed and carries on", async () => {
    await stockOutbox.add({ id: "a", owner: "u1", data: job(1) });
    await new Promise((r) => setTimeout(r, 2));
    await stockOutbox.add({ id: "b", owner: "u1", data: job(2) });
    const { supabase } = fake([{ message: "no_change", code: "P0001" }, null]);
    expect(await flushStockOutbox(supabase, "u1")).toEqual({ sent: 1, failed: 1, stalled: false });
    expect((await stockOutbox.list("u1")).map((i) => i.status)).toEqual(["failed"]);
  });
  it("never sends another person's changes", async () => {
    await stockOutbox.add({ id: "a", owner: "u2", data: job(1) });
    const { supabase, calls } = fake([]);
    await flushStockOutbox(supabase, "u1");
    expect(calls).toHaveLength(0);
    await stockOutbox.remove("a");
  });
});
