import { describe, expect, it } from "vitest";
import { createKvCache } from "./kv-cache";

// No IndexedDB here, so these run against the in-memory fallback.
describe("kv cache", () => {
  it("returns what was saved for the same owner only", async () => {
    const c = createKvCache("t1");
    await c.set("a", "list", [1, 2]);
    expect((await c.get<number[]>("a", "list"))?.value).toEqual([1, 2]);
    expect(await c.get("b", "list")).toBeUndefined();
  });
  it("clears one owner or everything", async () => {
    const c = createKvCache("t2");
    await c.set("a", "k", 1); await c.set("b", "k", 2);
    await c.clear("a");
    expect(await c.get("a", "k")).toBeUndefined();
    expect((await c.get<number>("b", "k"))?.value).toBe(2);
    await c.clear();
    expect(await c.get("b", "k")).toBeUndefined();
  });
});
