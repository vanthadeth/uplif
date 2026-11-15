import { assertEquals } from "jsr:@std/assert@1";
import { allowedOrigin, safeNext, validState } from "./lib.ts";

Deno.test("allowedOrigin accepts only listed apps", () => {
  const list = ["https://uplif-me.vercel.app", "https://uplif-go.vercel.app/"];
  assertEquals(allowedOrigin("https://uplif-me.vercel.app/", list), "https://uplif-me.vercel.app");
  assertEquals(allowedOrigin("https://uplif-go.vercel.app", list), "https://uplif-go.vercel.app");
  assertEquals(allowedOrigin("https://evil.example", list), null);
  assertEquals(allowedOrigin("https://uplif-me.vercel.app.evil.example", list), null);
  assertEquals(allowedOrigin(null, list), null);
});
Deno.test("safeNext blocks open redirects", () => {
  assertEquals(safeNext("/stock/items"), "/stock/items");
  assertEquals(safeNext("//evil.example"), "/");
  assertEquals(safeNext("https://evil.example"), "/");
  assertEquals(safeNext("/\\evil"), "/");
});
Deno.test("validState", () => {
  assertEquals(validState("abcdEFGH12345678_-"), true);
  assertEquals(validState("short"), false);
  assertEquals(validState("has space has space has space"), false);
});
