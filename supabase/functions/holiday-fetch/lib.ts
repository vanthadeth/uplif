// Pure helpers for the yearly holiday fetch. Web APIs only, so they run in Deno and in Node for tests.

export interface Holiday { date: string; name: string; name_local: string | null }

/** Data source: Nager.Date, a free public-holiday API that needs no key. https://date.nager.at */
export const NAGER_URL = "https://date.nager.at/api/v3/PublicHolidays";

/**
 * Turns a Nager.Date answer into our holiday list. Only nation-wide public holidays are kept: regional ones
 * (global = false) and bank, optional or observance days are skipped. Dates outside the asked year are dropped.
 * Throws when the answer is not a list, so a changed or broken source fails loudly instead of saving nothing.
 */
export function parseNager(json: unknown, year: number): Holiday[] {
  if (!Array.isArray(json)) throw new Error("unexpected answer from the holiday source");
  const out = new Map<string, Holiday>();
  for (const x of json) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || Number(date.slice(0, 4)) !== year) continue;
    if (r.global === false) continue;
    const types = Array.isArray(r.types) ? r.types : ["Public"];
    if (!types.includes("Public")) continue;
    const local = typeof r.localName === "string" ? r.localName.trim() : "";
    out.set(`${date}|${name}`, { date, name: name.slice(0, 120), name_local: local && local !== name ? local.slice(0, 120) : null });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type FetchOutcome =
  | { status: "ok"; holidays: Holiday[] }
  | { status: "unsupported"; error: string }
  | { status: "failed"; error: string };

/** Fetches one country and year. Never throws: every problem becomes an outcome the database records. */
export async function fetchCountry(country: string, year: number, fetcher: typeof fetch = fetch): Promise<FetchOutcome> {
  try {
    const res = await fetcher(`${NAGER_URL}/${year}/${country}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    // 404 is how the source says it does not cover a country; 204 an empty answer.
    if (res.status === 404) return { status: "unsupported", error: "the source does not cover this country" };
    if (res.status === 204) return { status: "failed", error: "the source returned no holidays" };
    if (!res.ok) return { status: "failed", error: `the source answered HTTP ${res.status}` };
    return { status: "ok", holidays: parseNager(await res.json(), year) };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message.slice(0, 200) : "request failed" };
  }
}

/** Constant-time text comparison for the shared secret. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
