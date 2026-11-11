import { describe, expect, it } from "vitest";
import { claudeProvider, machineProvider, MachineUnavailable, parseTranslations, stubProvider } from "./machine";
import { sameTokens, tokensOf } from "./types";

describe("machine translation", () => {
  it("reads a JSON reply, even inside a code fence, and drops empty or non-text values", () => {
    expect(parseTranslations('```json\n{"a":"x {n}","b":"","c":3}\n```')).toEqual({ a: "x {n}" });
    expect(parseTranslations("sorry")).toEqual({});
    expect(parseTranslations("{broken")).toEqual({});
  });
  it("uses the stub, which reports unavailable, without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(machineProvider()).toBe(stubProvider);
    await expect(stubProvider.translate([], { code: "es", name: "Spanish" })).rejects.toBeInstanceOf(MachineUnavailable);
  });
  it("sends strings in batches and merges the replies", async () => {
    const calls: unknown[] = [];
    const fake = (async (_u: string, init: { body: string }) => {
      const sent = JSON.parse(JSON.parse(init.body).messages[0].content) as Record<string, string>;
      calls.push(sent);
      return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(Object.fromEntries(Object.entries(sent).map(([k, v]) => [k, `T:${v}`]))) }] }) };
    }) as unknown as typeof fetch;
    const items = Array.from({ length: 85 }, (_, i) => ({ key: `k${i}`, text: `v${i}` }));
    const out = await claudeProvider("key", fake).translate(items, { code: "es", name: "Spanish" });
    expect(calls).toHaveLength(3);
    expect(Object.keys(out)).toHaveLength(85);
    expect(out.k84).toBe("T:v84");
  });
  it("compares {tokens} like the database does", () => {
    expect(tokensOf("Hi {name}, {name} {b}")).toEqual(["{b}", "{name}"]);
    expect(sameTokens("A {x} {y}", "{y} B {x}")).toBe(true);
    expect(sameTokens("A {x}", "B")).toBe(false);
  });
});
