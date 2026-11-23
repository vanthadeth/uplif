import { describe, expect, it } from "vitest";
import { createOutbox, flushOutbox } from "./outbox";

describe("flushOutbox", () => {
  it("sends oldest first, stops on a connection problem, marks other errors failed", async () => {
    const ob = createOutbox<string>("flush-test");
    for (const id of ["a", "b", "c", "d"]) { await ob.add({ id, owner: "me", data: id }); await new Promise((r) => setTimeout(r, 2)); }
    await ob.add({ id: "x", owner: "someone-else", data: "x" });
    const seen: string[] = [];
    const r = await flushOutbox(ob, "me", async (it) => {
      seen.push(it.id);
      if (it.id === "b") return { message: "bad", code: "P0001" };
      if (it.id === "c") return { message: "Failed to fetch" };
      return null;
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(r).toEqual({ sent: 1, failed: 1, stalled: true });
    const left = await ob.list("me");
    expect(left.map((i) => [i.id, i.status])).toEqual([["b", "failed"], ["c", "pending"], ["d", "pending"]]);
    expect((await ob.list("someone-else")).length).toBe(1);
  });
});
