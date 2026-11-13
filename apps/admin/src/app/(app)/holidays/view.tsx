"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader, ErrorState } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { fmtTime } from "@/components/bits";

interface Alert { country_code: string; year: number; last_error: string | null; occurrences: number; first_seen: string; last_seen: string; acknowledged_at: string | null }
interface Run { id: string; year: number; forced: boolean; status: "requested" | "ok" | "partial" | "failed"; countries: number; failed: number; requested_at: string; finished_at: string | null }
interface Country { country_code: string; companies: number; presets: number; manual: number; last_status: string | null; last_error: string | null; last_at: string | null }
export interface Overview { next_year: number; alerts: Alert[]; runs: Run[]; countries: Country[] }

const tone = (s: string | null) => (s === "ok" ? "success" : s === "requested" ? "info" : s ? "warning" : "neutral") as "success" | "info" | "warning" | "neutral";

export function HolidaysView({ data }: { data: Overview | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const header = (
    <div>
      <h1 className="text-2xl font-bold">Holidays</h1>
      <p className="text-muted">Public holidays are fetched on the last day of September, October, November and December for every country where a company exists. Companies import them themselves; nothing in a company calendar changes on its own.</p>
    </div>
  );
  if (!data) return <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">{header}<ErrorState title="Holiday status could not be loaded" body="Check that the database migrations are applied, then reload." /></div>;

  async function ack(a: Alert) {
    setBusy(`${a.country_code}${a.year}`);
    await createClient().rpc("platform_ack_holiday_alert", { p_country: a.country_code, p_year: a.year });
    setBusy(undefined);
    router.refresh();
  }
  const open = data.alerts.filter((a) => !a.acknowledged_at);
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      {header}
      <Card>
        <CardHeader title="Alerts" />
        {open.length === 0 ? <p className="p-5 text-muted">No fetch problems.</p> : (
          <ul>
            {open.map((a) => (
              <li key={`${a.country_code}${a.year}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0">
                <div className="min-w-0">
                  <b className="font-semibold">{a.country_code === "*" ? "The whole run" : a.country_code} · {a.year}</b>
                  <p className="m-0 text-[14px] text-muted">{a.last_error ?? "Failed"} · seen {a.occurrences}× · last {fmtTime(a.last_seen)}</p>
                  {a.country_code !== "*" && <p className="m-0 text-[14px] text-muted">Fix: enter this country&apos;s {a.year} presets by hand (source &quot;manual&quot;); the alert then clears.</p>}
                </div>
                <Button loading={busy === `${a.country_code}${a.year}`} onClick={() => ack(a)}>Acknowledge</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={`Countries (${data.next_year} presets)`} />
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-line text-[14px] text-muted"><th className="px-5 py-2 font-medium">Country</th><th className="px-3 py-2 font-medium">Companies</th><th className="px-3 py-2 font-medium">Presets</th><th className="px-3 py-2 font-medium">Last fetch</th></tr></thead>
            <tbody>
              {data.countries.map((c) => (
                <tr key={c.country_code} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-2.5 font-semibold">{c.country_code}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.companies}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.presets}{c.manual > 0 && <span className="text-muted"> ({c.manual} by hand)</span>}</td>
                  <td className="px-3 py-2.5">{c.last_status ? <Badge tone={tone(c.last_status === "ok" ? "ok" : "failed")}>{c.last_status === "ok" ? "OK" : c.last_status === "unsupported" ? "Not covered by the source" : "Failed"}</Badge> : <span className="text-muted">Never</span>}{c.last_at && <span className="ml-2 text-muted">{fmtTime(c.last_at)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Recent runs" />
        {data.runs.length === 0 ? <p className="p-5 text-muted">No run yet. The first one happens on 30 September.</p> : (
          <ul>
            {data.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 last:border-b-0">
                <span><b className="font-semibold">{r.year}</b> · {fmtTime(r.requested_at)}{r.forced ? " · started by hand" : ""}</span>
                <span className="flex items-center gap-2 text-[14px] text-muted">{r.countries} countries{r.failed ? `, ${r.failed} failed` : ""}<Badge tone={tone(r.status)}>{r.status}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
