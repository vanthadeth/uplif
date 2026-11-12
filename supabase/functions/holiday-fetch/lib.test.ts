// Run with: node --experimental-strip-types --test supabase/functions/holiday-fetch/lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCountry, parseNager, safeEqual } from "./lib.ts";

const sample = [
  { date: "2027-01-01", localName: "Neujahr", name: "New Year's Day", global: true, types: ["Public"] },
  { date: "2027-03-05", localName: "Regional", name: "Regional day", global: false, types: ["Public"] },
  { date: "2027-04-01", localName: "Bank", name: "Bank day", global: true, types: ["Bank"] },
  { date: "2026-12-25", localName: "Weihnachten", name: "Christmas Day", global: true, types: ["Public"] },
  { date: "2027-12-25", localName: "Christmas Day", name: "Christmas Day", global: true, types: ["Public"] },
  { date: "bad", name: "x", global: true },
  { date: "2027-01-01", localName: "Neujahr", name: "New Year's Day", global: true, types: ["Public"] },
];

test("keeps nation-wide public holidays of the asked year, once each, sorted", () => {
  const r = parseNager(sample, 2027);
  assert.deepEqual(r.map((h) => h.date), ["2027-01-01", "2027-12-25"]);
  assert.equal(r[0].name_local, "Neujahr");
  assert.equal(r[1].name_local, null); // same as the English name
});
test("a non-list answer is an error", () => assert.throws(() => parseNager({ error: 1 }, 2027)));

const reply = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;
test("404 means unsupported, 204 and 5xx mean failed, 200 parses", async () => {
  assert.equal((await fetchCountry("KH", 2027, reply(404))).status, "unsupported");
  assert.equal((await fetchCountry("KH", 2027, reply(204))).status, "failed");
  assert.equal((await fetchCountry("KH", 2027, reply(503))).status, "failed");
  const ok = await fetchCountry("DE", 2027, reply(200, sample));
  assert.equal(ok.status, "ok");
});
test("a network error becomes a failed outcome", async () => {
  const boom = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const r = await fetchCountry("DE", 2027, boom);
  assert.deepEqual(r, { status: "failed", error: "offline" });
});
test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
