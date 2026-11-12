// Yearly public-holiday fetch for UPLIF.
//
// A database job (pg_cron, last day of September, October, November and December) calls this function. It downloads
// next year's public holidays for every country where a company exists and saves them as presets, one country at a
// time, through database functions that only the service role may call. A company's own holiday calendar is never
// touched: companies import presets themselves. Every country's result is logged, and a failure raises an alert for
// platform staff in the admin app.
//
// Secrets to set (Edge Functions -> Secrets): HOLIDAY_CRON_SECRET, a long random text. Use the same text as the Vault
// secret `holiday_cron_secret` (Vault -> New secret) that the database job sends. Turn "Verify JWT" off for this
// function: the caller proves itself with the x-cron-secret header instead. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Try it from a terminal without saving anything:
//   curl -X POST "$SUPABASE_URL/functions/v1/holiday-fetch" -H "x-cron-secret: $SECRET" \
//        -H "content-type: application/json" -d '{"dry":true,"year":2027,"countries":["KH","TH","VN"]}'
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchCountry, safeEqual } from "./lib.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const secret = env("HOLIDAY_CRON_SECRET");
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function work(runId: string, year: number, countries: string[]) {
  for (const c of countries) {
    const out = await fetchCountry(c, year);
    const { error } = await admin.rpc("holiday_record_fetch", {
      p_run: runId, p_country: c, p_year: year, p_status: out.status, p_source: "nager",
      p_holidays: out.status === "ok" ? out.holidays : [], p_error: out.status === "ok" ? null : out.error,
    });
    if (error) console.error("holiday-fetch: could not record", c, error.message);
    await new Promise((r) => setTimeout(r, 300)); // be polite to a free service
  }
  const { error } = await admin.rpc("holiday_finish_run", { p_run: runId });
  if (error) console.error("holiday-fetch: could not finish run", error.message);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!secret) return json({ error: "not configured" }, 503);
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({})) as { run_id?: string; year?: number; dry?: boolean; countries?: string[] };

  // Dry run: fetch and show, save nothing.
  if (body.dry) {
    const year = Number(body.year) || new Date().getUTCFullYear() + 1;
    const list = (body.countries ?? []).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 20);
    const results: Record<string, unknown> = {};
    for (const c of list) {
      const out = await fetchCountry(c, year);
      results[c] = out.status === "ok" ? { status: "ok", count: out.holidays.length, holidays: out.holidays } : out;
    }
    return json({ year, results });
  }

  const { data, error } = await admin.rpc("holiday_begin_run", { p_run_id: body.run_id ?? null, p_year: body.year ?? null });
  const run = data?.[0];
  if (error || !run) return json({ error: "could not start the run" }, 500);
  // Answer at once; the countries are fetched in the background (the database job only waits for the answer).
  const job = work(run.run_id, run.year, run.countries);
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(job) : await job;
  return json({ run_id: run.run_id, year: run.year, countries: run.countries.length }, 202);
});
