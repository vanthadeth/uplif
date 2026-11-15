// Pure helpers for sso-handoff (kept apart so they can be unit tested).

/** The requested app origin, only if it is exactly on the allowed list. No fallback: unknown apps are refused. */
export function allowedOrigin(requested: string | null | undefined, allowed: string[]): string | null {
  const want = (requested ?? "").trim().replace(/\/$/, "");
  const clean = allowed.map((a) => a.trim().replace(/\/$/, "")).filter(Boolean);
  return want && clean.includes(want) ? want : null;
}

/** Only same-site relative paths may be used as a destination (no open redirects). */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

/** The state value is a random token made by the app; accept only a plain url-safe string of sensible length. */
export function validState(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
