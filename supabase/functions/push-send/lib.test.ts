import { assertEquals } from "jsr:@std/assert@1";
import { isGone, safeEqual, wordsFor } from "./lib.ts";

Deno.test("words fall back to English", () => {
  assertEquals(wordsFor("km").body, "អ្នកមានដំណឹងថ្មី។");
  assertEquals(wordsFor("zh").body, "You have a new update.");
  assertEquals(wordsFor(null).title, "UPLIF Me");
});
Deno.test("safeEqual", () => {
  assertEquals(safeEqual("abc", "abc"), true);
  assertEquals(safeEqual("abc", "abd"), false);
  assertEquals(safeEqual("abc", "abcd"), false);
});
Deno.test("gone", () => {
  assertEquals(isGone(410), true);
  assertEquals(isGone(404), true);
  assertEquals(isGone(500), false);
  assertEquals(isGone(undefined), false);
});
