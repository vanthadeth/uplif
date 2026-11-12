// Pure helpers for the Telegram sign-in function. Web APIs only, so they run in Deno and in Node for tests.

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const pad = "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** "payload.signature": the payload is JSON, the signature is HMAC-SHA256 over it. Tamper-proof, not secret. */
export async function sealCookie(value: object, secret: string): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify(value)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload)));
  return `${payload}.${b64urlEncode(sig)}`;
}

export async function openCookie<T>(sealed: string | undefined, secret: string): Promise<T | null> {
  if (!sealed) return null;
  const [payload, sig] = sealed.split(".");
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), b64urlDecode(sig), enc.encode(payload));
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as T; } catch { return null; }
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Only same-site relative paths may be used as a post-login destination (no open redirects). */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

/** Telegram gives no email address, and Supabase needs one, so each Telegram user gets a placeholder address. */
export function placeholderEmail(telegramId: string): string {
  return `tg-${telegramId}@telegram.uplif.invalid`;
}

export interface Jwk { kty: string; kid?: string; n?: string; e?: string; alg?: string; use?: string }
export interface TelegramClaims { sub: string; iss: string; aud: string | string[]; exp: number; iat?: number; name?: string; preferred_username?: string; picture?: string }

/** Verifies an RS256 ID token: signature against Telegram's published keys, issuer, audience, and expiry. */
export async function verifyIdToken(
  idToken: string, keys: Jwk[], expect: { issuer: string; audience: string; now?: number },
): Promise<TelegramClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("unknown signing key");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("bad signature");
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as TelegramClaims;
  if (claims.iss !== expect.issuer) throw new Error("wrong issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expect.audience)) throw new Error("wrong audience");
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("token expired");
  if (!claims.sub || !/^\d+$/.test(String(claims.sub))) throw new Error("missing subject");
  return claims;
}
