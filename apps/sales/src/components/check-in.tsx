"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, X } from "lucide-react";
import { Badge, Button, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { initials, shownName } from "@/lib/customers";

interface Near { customer_id: string; name: string; name_local: string | null; address: string | null; distance_m: number | null; in_range: boolean }
type Fix = { lat: number; lon: number; acc: number };
const RANGE_M = 100;

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** Check in at a customer: the phone's location, the nearest customers first, then one tap. Warns about a weak signal, never blocks. */
export default function CheckIn() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [rows, setRows] = useState<Near[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | "none" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ name: string; since: string } | null>(null);
  const idRef = useRef<string>("");
  if (!idRef.current && typeof crypto !== "undefined") idRef.current = crypto.randomUUID();

  const locate = useCallback(() => {
    setGpsError(false); setFix(null);
    if (!navigator.geolocation) { setGpsError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setFix({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);
  useEffect(() => { locate(); }, [locate]);

  useEffect(() => {
    if (!fix && !gpsError) return;
    let live = true;
    createClient().rpc("sales_nearby", { p_latitude: fix?.lat ?? 0, p_longitude: fix?.lon ?? 0, p_limit: 20 }).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { setFailed(true); return; }
      setFailed(false);
      const list = (data ?? []) as unknown as Near[];
      // Without a location every distance is meaningless, so show names only.
      setRows(fix ? list : list.map((r) => ({ ...r, distance_m: null, in_range: false })));
      const first = list[0];
      if (fix && first?.in_range) setPicked((p) => p ?? first.customer_id);
    });
    return () => { live = false; };
  }, [fix, gpsError]);

  const accTone = !fix ? "neutral" : fix.acc <= 30 ? "success" : fix.acc <= 100 ? "warning" : "danger";
  const target = rows?.find((r) => r.customer_id === picked) ?? null;

  async function go() {
    if (!picked) return;
    setSaving(true); setError("");
    const { data, error: e } = await createClient().rpc("sales_check_in", {
      p_id: idRef.current, p_customer_id: picked === "none" ? null : picked, p_latitude: fix?.lat ?? null, p_longitude: fix?.lon ?? null,
      p_accuracy_m: fix?.acc ?? null, p_at: new Date().toISOString(),
    });
    setSaving(false);
    if (e || !data) { setError(t("go.checkin.failed")); return; }
    const res = data as unknown as { already_open?: boolean; customer_id?: string | null; checked_in_at?: string };
    if (res.already_open) { setOpen({ name: res.customer_id ?? "", since: res.checked_in_at ?? "" }); return; }
    router.replace(picked === "none" ? "/" : `/customers/${picked}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href="/" aria-label={t("go.cancel")} className="grid size-10 place-items-center"><X className="size-5" aria-hidden /></Link>
        <h1 className="m-0 flex-1 text-base font-semibold">{t("go.checkin.title")}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3.5 p-4 pb-40">
        <div role="status" className={`flex items-center gap-3 rounded-card border p-3 ${accTone === "success" ? "border-success/30 bg-success-soft text-success-ink" : accTone === "neutral" ? "border-line bg-surface" : accTone === "warning" ? "border-warning/30 bg-warning-soft text-warning-ink" : "border-danger/30 bg-danger-soft text-danger-ink"}`}>
          <MapPin className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <b className="block">{gpsError ? t("go.checkin.gpsOff") : !fix ? t("go.checkin.locating") : fill(t(fix.acc <= 30 ? "go.checkin.gpsGood" : "go.checkin.gpsWeak"), { m: fix.acc })}</b>
            <span className="text-xs">{fill(t("go.checkin.range"), { m: RANGE_M })}</span>
          </div>
          <button type="button" onClick={locate} className="text-sm font-semibold">{t("go.checkin.refresh")}</button>
        </div>

        {open && (
          <div role="alert" className="rounded-card bg-warning-soft p-3 text-warning-ink"><b className="block">{t("go.checkin.already")}</b>{t("go.checkin.alreadyBody")}</div>
        )}
        {failed ? (
          <ErrorState title={t("go.checkin.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={locate}>{t("go.retry")}</Button>} />
        ) : rows === null ? (
          <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
        ) : (
          <>
            <div className="flex items-center"><b className="flex-1">{fill(t("go.checkin.nearby"), { n: rows.length })}</b><span className="text-xs text-muted">{t("go.checkin.nearestFirst")}</span></div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((r, i) => {
                const name = shownName(r, locale), on = picked === r.customer_id;
                return (
                  <li key={r.customer_id}>
                    <Reveal delay={Math.min(i, 8) * 30}>
                      <button type="button" aria-pressed={on} onClick={() => setPicked(r.customer_id)}
                        className={`flex w-full items-center gap-3 rounded-card border p-3 text-start transition-colors ${on ? "border-2 border-primary bg-primary-soft/40" : "border-line bg-surface"}`}>
                        <span aria-hidden className={`grid size-5.5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-primary" : "border-muted"}`}>{on && <span className="size-2.5 rounded-full bg-primary" />}</span>
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-soft font-semibold text-ink-2">{initials(name)}</span>
                        <span className="min-w-0 flex-1"><b className="block truncate">{name}</b><span className="block truncate text-xs text-muted">{r.address ?? ""}</span></span>
                        {r.distance_m !== null && (
                          <span className="shrink-0 text-end"><b className="block">{metres(r.distance_m)}</b><Badge tone={r.in_range ? "success" : "warning"}>{t(r.in_range ? "go.checkin.inRange" : "go.checkin.outRange")}</Badge></span>
                        )}
                      </button>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
            <button type="button" aria-pressed={picked === "none"} onClick={() => setPicked("none")}
              className={`flex min-h-13 items-center justify-center rounded-card border-[1.5px] border-dashed font-semibold ${picked === "none" ? "border-primary bg-primary-soft/40 text-primary-ink" : "border-muted text-ink-2"}`}>{t("go.checkin.none")}</button>
          </>
        )}
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-2 border-t border-line bg-surface px-4 pb-6 pt-3">
        {error && <p role="alert" className="m-0 rounded-card bg-danger-soft p-2 text-sm text-danger-ink">{error}</p>}
        <p className="m-0 text-center text-xs text-muted">{t("go.checkin.saved")}</p>
        <Button variant="primary" className="h-13 w-full text-base" disabled={!picked} loading={saving} onClick={go}>
          <MapPin className="size-5" aria-hidden />{picked === "none" || !target ? t("go.checkin.go") : fill(t("go.checkin.goAt"), { name: shownName(target, locale) })}
        </Button>
      </footer>
    </div>
  );
}
