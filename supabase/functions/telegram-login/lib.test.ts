// Run with: node --experimental-strip-types --test supabase/functions/telegram-login/lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { b64urlEncode, openCookie, pkceChallenge, placeholderEmail, safeNext, sealCookie, sha256Hex, verifyIdToken } from "./lib.ts";

const enc = new TextEncoder();
async function makeToken(claims: object, opts: { kid?: string; alg?: string } = {}) {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const head = b64urlEncode(enc.encode(JSON.stringify({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1", typ: "JWT" })));
  const body = b64urlEncode(enc.encode(JSON.stringify(claims)));
  const sig = b64urlEncode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, enc.encode(`${head}.${body}`))));
  return { token: `${head}.${body}.${sig}`, keys: [{ kty: "RSA", kid: "k1", n: jwk.n!, e: jwk.e! }], head, body };
}
const good = { iss: "https://oauth.telegram.org", aud: "123456", sub: "987654321", exp: 2_000_000_000, name: "Dara" };
const expect = { issuer: "https://oauth.telegram.org", audience: "123456", now: 1_900_000_000 };

test("accepts a valid token", async () => {
  const { token, keys } = await makeToken(good);
  assert.equal((await verifyIdToken(token, keys, expect)).sub, "987654321");
});
test("rejects a tampered payload", async () => {
  const { token, keys, head } = await makeToken(good);
  const forged = `${head}.${b64urlEncode(enc.encode(JSON.stringify({ ...good, sub: "1" })))}.${token.split(".")[2]}`;
  await assert.rejects(verifyIdToken(forged, keys, expect), /bad signature/);
});
test("rejects wrong issuer, audience, expired, unknown key, other algorithm, non-numeric subject", async () => {
  const a = await makeToken({ ...good, iss: "https://evil.example" });
  await assert.rejects(verifyIdToken(a.token, a.keys, expect), /issuer/);
  const b = await makeToken({ ...good, aud: "999" });
  await assert.rejects(verifyIdToken(b.token, b.keys, expect), /audience/);
  const c = await makeToken({ ...good, exp: 1_800_000_000 });
  await assert.rejects(verifyIdToken(c.token, c.keys, expect), /expired/);
  const d = await makeToken(good, { kid: "other" });
  await assert.rejects(verifyIdToken(d.token, d.keys.map((k) => ({ ...k, kid: "k1" })), expect), /unknown signing key/);
  const e = await makeToken(good, { alg: "none" });
  await assert.rejects(verifyIdToken(e.token, e.keys, expect), /algorithm/);
  const f = await makeToken({ ...good, sub: "abc" });
  await assert.rejects(verifyIdToken(f.token, f.keys, expect), /subject/);
});
test("sealed cookie round-trips and refuses tampering or a wrong secret", async () => {
  const sealed = await sealCookie({ s: "x" }, "secret");
  assert.deepEqual(await openCookie(sealed, "secret"), { s: "x" });
  assert.equal(await openCookie(sealed, "other"), null);
  assert.equal(await openCookie(`${b64urlEncode(enc.encode('{"s":"y"}'))}.${sealed.split(".")[1]}`, "secret"), null);
  assert.equal(await openCookie(undefined, "secret"), null);
});
test("PKCE challenge matches the RFC 7636 example", async () => {
  assert.equal(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
test("safeNext and placeholderEmail", () => {
  assert.equal(safeNext("/users"), "/users");
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil", "", null]) assert.equal(safeNext(bad as never), null);
  assert.equal(placeholderEmail("42"), "tg-42@telegram.uplif.invalid");
});
test("sha256Hex matches the standard vector", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
