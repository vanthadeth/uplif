"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Camera, Check, MapPin, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button, ProgressBar, Spinner } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { deviceId } from "@/lib/store";
import { distanceM, ymd } from "@/lib/format";
import { useMe, useDisplay } from "./me-context";
import { useClockOutbox } from "./outbox-context";
import { isNetworkError } from "@/lib/clock-outbox";

type Gps = { status: "getting" } | { status: "denied" } | { status: "ok"; lat: number; lon: number; acc: number };
type Step = "locate" | "camera" | "preview" | "sending" | "done";

/** Placeholders for company settings: how accurate the location must be, and how long to wait for it. Never blocks the clock-in. */
const TARGET_M = 30;
const WAIT_S = 15;

const FLAG_KEYS: Record<string, MessageKey> = {
  offline: "st.flag.offline",
  outside_geofence: "st.flag.outside_geofence", no_gps: "st.flag.no_gps", low_accuracy: "st.flag.low_accuracy",
  clock_drift: "st.flag.clock_drift", missing_selfie: "st.flag.missing_selfie", shared_device: "st.flag.shared_device",
};

/**
 * The full-screen clock flow: selfie and location check, confirm, then the saved screen.
 * The server decides what is flagged; the distance shown here is only a heads-up before the photo.
 */
export function ClockFlow({ kind, onClose, onSaved }: { kind: "in" | "out"; onClose: () => void; onSaved: () => void }) {
  const state = useMe();
  const { t, locale } = useI18n();
  const { branch: branchName } = useDisplay(state, locale);
  const { time } = useFormat();
  const outbox = useClockOutbox();

  const [step, setStep] = useState<Step>("locate");
  const [cameraError, setCameraError] = useState<"" | "denied" | "none">("");
  const [gps, setGps] = useState<Gps>({ status: "getting" });
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ at: string; flags: string[]; queued?: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptRef = useRef<string>("");
  const openedAt = useRef(new Date());

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);
  // The flow is a full-screen layer: the page behind it must not scroll.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, []);
  useEffect(() => { return () => { if (photo) URL.revokeObjectURL(photo.url); }; }, [photo]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch (e) {
      setCameraError((e as DOMException)?.name === "NotFoundError" ? "none" : "denied");
    }
  }, []);
  const [locating, setLocating] = useState<{ acc: number | null; left: number } | null>({ acc: null, left: WAIT_S });
  const [settled, setSettled] = useState<"good" | "weak" | "denied" | null>(null);
  const watchRef = useRef<number | null>(null);
  const stopGps = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);
  useEffect(() => stopGps, [stopGps]);

  /** Watch the location until it is accurate enough or the wait runs out, keeping the best reading. */
  const startGps = useCallback(() => {
    stopGps();
    attemptRef.current = crypto.randomUUID();
    setGps({ status: "getting" }); setSettled(null); setLocating({ acc: null, left: WAIT_S }); setStep("locate");
    if (!navigator.geolocation) { setGps({ status: "denied" }); setSettled("denied"); return; }
    let best: { lat: number; lon: number; acc: number } | null = null;
    const started = Date.now();
    let finished = false;
    const finish = (how: "good" | "weak" | "denied") => {
      if (finished) return;
      finished = true;
      clearInterval(tick);
      stopGps();
      if (best) setGps({ status: "ok", ...best }); else setGps({ status: "denied" });
      setSettled(how);
      if (how === "good") setStep("camera");
    };
    const tick = setInterval(() => {
      const left = Math.max(0, WAIT_S - Math.round((Date.now() - started) / 1000));
      setLocating((l) => ({ acc: l?.acc ?? null, left }));
      if (left === 0) finish(best ? "weak" : "denied");
    }, 500);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const acc = Math.round(p.coords.accuracy);
        if (!best || acc < best.acc) best = { lat: p.coords.latitude, lon: p.coords.longitude, acc };
        setLocating((l) => ({ acc: best!.acc, left: l?.left ?? WAIT_S }));
        if (best.acc <= TARGET_M) finish("good");
      },
      () => finish(best ? "weak" : "denied"),
      { enableHighAccuracy: true, timeout: WAIT_S * 1000, maximumAge: 0 },
    );
  }, [stopGps]);

  useEffect(() => { startGps(); }, [startGps]);
  useEffect(() => { if (step === "camera") void startCamera(); }, [step, startCamera]);

  function close() { stopCamera(); stopGps(); setPhoto(null); onClose(); }

  function take() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = 480 / Math.max(v.videoWidth, v.videoHeight);
    const w = Math.round(v.videoWidth * Math.min(scale, 1)), h = Math.round(v.videoHeight * Math.min(scale, 1));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    c.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setStep("preview");
    }, "image/jpeg", 0.7);
  }
  function retake() { setPhoto(null); setStep("camera"); }

  const errorText = (msg: string): string => {
    if (msg.includes("already clocked in")) return t("st.err.alreadyIn");
    if (msg.includes("not clocked in")) return t("st.err.notIn");
    if (msg.includes("selfie required")) return t("st.err.selfie");
    if (msg.includes("outside area")) return t("st.err.outside");
    if (msg.includes("module not in plan")) return t("st.err.module");
    if (msg.includes("employee not active")) return t("st.err.inactive");
    return t("st.err.generic");
  };

  async function send() {
    if (!photo) return;
    setStep("sending"); setError("");
    const supabase = createClient();
    const eventId = attemptRef.current;
    const deviceTime = new Date().toISOString();
    const g = gps.status === "ok" ? gps : null;

    /** Keep the clock on this phone; it is sent when there is signal. */
    const saveOnPhone = async () => {
      await outbox.save({
        kind, eventId, deviceTime, day: ymd(new Date()), lat: g ? g.lat : null, lon: g ? g.lon : null, acc: g ? g.acc : null,
        selfie: photo.blob, deviceId: deviceId(), companyId: state.company_id ?? "", employeeId: state.employee_id ?? "",
      });
      setDone({ at: deviceTime, flags: [], queued: true });
      setStep("done");
    };
    // Something already waits to be sent, or there is no signal: keep the order and save it too.
    if (!navigator.onLine || outbox.items.some((i) => i.status === "pending")) { await saveOnPhone(); return; }

    const path = `${state.company_id}/${state.employee_id}/${ymd(new Date())}/${eventId}.jpg`;
    const up = await supabase.storage.from("attendance-selfies").upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
    if (up.error && !/exist|duplicate/i.test(up.error.message)) {
      if (isNetworkError(up.error)) { await saveOnPhone(); return; }
      setError(t("st.err.upload")); setStep("preview"); return;
    }
    const { data, error: err } = await supabase.rpc("attendance_clock", {
      p_kind: kind, p_client_event_id: eventId, p_device_time: deviceTime,
      p_latitude: g ? g.lat : null, p_longitude: g ? g.lon : null, p_accuracy_m: g ? g.acc : null,
      p_selfie_path: path, p_device_id: deviceId(),
    });
    if (err && isNetworkError(err)) { await saveOnPhone(); return; }
    if (err || !data) { setError(errorText(err?.message ?? "")); setStep("preview"); return; }
    setDone({ at: data.occurred_at, flags: data.flags });
    setStep("done");
    onSaved();
  }

  // How the location compares with the branch, shown before the photo.
  const b = state.branch;
  const away = gps.status === "ok" && b && b.latitude != null && b.longitude != null ? distanceM(gps.lat, gps.lon, b.latitude, b.longitude) : null;
  const inside = away !== null && b ? away <= b.radius_m : null;
  const gpsTitle = gps.status === "getting" ? t("st.gps.getting")
    : gps.status === "denied" ? t("st.gps.denied")
    : inside === true ? fill(t("st.gps.inside"), { branch: branchName ?? "" })
    : inside === false ? fill(t("st.gps.away"), { m: away ?? 0, branch: branchName ?? "" })
    : gps.acc > 100 ? t("st.gps.weak") : fill(t("st.gps.ok"), { m: gps.acc });
  const gpsSub = gps.status === "ok" && inside !== null ? (gps.acc > 100 ? t("st.gps.weak") : fill(t("st.gps.ok"), { m: gps.acc })) : null;
  const gpsGood = gps.status === "ok" && inside !== false && gps.acc <= 100;

  // Rendered on the page body, outside the page transition, so it always sits above the bottom navigation.
  const layer = (node: React.ReactElement) => createPortal(node, document.body);

  if (step === "done" && done) {
    const outside = done.flags.includes("outside_geofence");
    return layer(
      <div role="dialog" aria-modal="true" aria-label={t(kind === "in" ? "st.done.in" : "st.done.out")} className="fixed inset-0 z-50 overflow-y-auto bg-ground">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-22 place-items-center rounded-full bg-success-soft text-success-ink"><Check className="size-11" aria-hidden /></span>
            <h1 className="text-2xl font-bold tracking-tight">{fill(t(kind === "in" ? "st.done.in" : "st.done.out"), { time: time(done.at) })}</h1>
            {done.queued && <p className="m-0 text-muted">{t("st.done.queued")}</p>}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            <li className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-control bg-success-soft text-success-ink"><Camera className="size-4" aria-hidden /></span><b>{t("st.done.selfie")}</b></li>
            <li className="flex items-center gap-3 p-4"><span className={`grid size-9 place-items-center rounded-control ${outside ? "bg-warning-soft text-warning-ink" : "bg-success-soft text-success-ink"}`}><MapPin className="size-4" aria-hidden /></span><b>{gpsTitle}</b></li>
          </ul>
          {done.flags.length > 0 && (
            <div role="status" className="flex gap-3 rounded-card bg-warning-soft p-4 text-warning-ink">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div><b className="block">{t("st.done.flagged")}</b>
                <ul className="mt-1 list-disc ps-5">{done.flags.map((f) => <li key={f}>{FLAG_KEYS[f] ? t(FLAG_KEYS[f]) : f}</li>)}</ul></div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="h-14 text-lg" onClick={close}>{t("st.done.ok")}</Button>
            <Link href="/record/attendance" onClick={close} className="inline-flex min-h-(--control-h) items-center justify-center rounded-control font-semibold text-link hover:bg-primary-soft">{t("st.done.history")}</Link>
          </div>
        </div>
      </div>
    );
  }

  // Camera, confirm and sending: the camera fills the screen and the header and buttons float over it on flat dark bars,
  // so the shutter or Confirm button is always on screen and nothing scrolls.
  if (step === "camera" || step === "preview" || step === "sending") {
    const cam = step === "camera";
    return layer(
      <div role="dialog" aria-modal="true" aria-label={t("st.step.photo")} className="fixed inset-x-0 top-0 z-50 h-dvh overflow-hidden bg-navy text-white">
        <div className="relative mx-auto h-full max-w-md overflow-hidden bg-[#141c30]">
          {cam && (
            <>
              <video ref={videoRef} playsInline muted className="absolute inset-0 size-full -scale-x-100 object-cover" />
              {!cameraError && (
                // The face oval fits the space between the header and the shutter, so it never runs under either on a short phone.
                <div className="pointer-events-none absolute inset-x-0 bottom-[10.5rem] top-40 flex flex-col items-center justify-center gap-3 px-6">
                  <span aria-hidden className="aspect-3/4 min-h-0 max-h-[min(93.3dvw,25.3rem)] max-w-[min(70dvw,19rem)] flex-1 rounded-full border-[3px] border-white shadow-[0_0_0_1200px_rgba(10,16,32,0.6)]" />
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-navy/70 px-3.5 py-1.5 text-sm">{t("st.step.hint")}</span>
                </div>
              )}
            </>
          )}
          {photo && !cam && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="" className="absolute inset-0 size-full -scale-x-100 object-cover" />
          )}
          {cam && cameraError && (
            <p role="alert" className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-card bg-danger-soft p-4 text-danger-ink">{t(cameraError === "none" ? "st.camera.none" : "st.camera.denied")}</p>
          )}

          <header className="absolute inset-x-0 top-0 flex flex-col gap-2.5 bg-navy/60 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              <button type="button" onClick={close} disabled={step === "sending"} aria-label={t("st.step.cancel")} className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-50"><X className="size-5" aria-hidden /></button>
              <div className="min-w-0 flex-1"><h2 className="m-0 text-lg font-bold">{t("st.step.photo")}</h2>
                <p className="m-0 text-sm text-white/75">{fill(t(kind === "in" ? "st.step.kind.in" : "st.step.kind.out"), { time: time(openedAt.current) })}</p></div>
              {!cam && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success-ink"><Check className="size-4" aria-hidden />{t("st.step.taken")}</span>}
            </div>
            <p className={`m-0 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${gpsGood ? "bg-[#4ade80]/15" : "bg-[#f59e0b]/20"}`} aria-live="polite">
              <MapPin className={`mt-0.5 size-5 shrink-0 ${gpsGood ? "text-[#7be0a5]" : "text-[#fbbf24]"}`} aria-hidden />
              <span className="min-w-0"><b>{gpsTitle}</b>{gpsSub && <span className="text-white/75"> {gpsSub}</span>}</span>
            </p>
          </header>

          {cam ? (
            // The shutter floats over the camera picture, so there is no bar to hide it and nothing to scroll.
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {error && <p role="alert" className="m-0 w-full rounded-card bg-danger-soft p-3 text-danger-ink">{error}</p>}
              <button type="button" disabled={!!cameraError} onClick={take} aria-label={t("st.step.take")} className="grid size-20 place-items-center rounded-full border-4 border-white shadow-[0_2px_14px_rgba(0,0,0,0.45)] transition-transform active:scale-95 disabled:opacity-40"><span className="size-15 rounded-full bg-white" /></button>
              <span className="rounded-full bg-navy/70 px-3 py-1 text-sm">{t("st.step.take")}</span>
            </div>
          ) : (
            <footer className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 bg-navy/60 px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-4">
              {error && <p role="alert" className="m-0 w-full rounded-card bg-danger-soft p-3 text-danger-ink">{error}</p>}
              <div className="flex w-full flex-col gap-2.5">
                <Button variant="primary" className="h-14 w-full bg-white! text-lg text-ink! hover:bg-white/90!" loading={step === "sending"} onClick={send}>{t(kind === "in" ? "st.step.send" : "st.step.sendOut")}</Button>
                <Button className="w-full border-white/25! bg-white/15! text-white! hover:bg-white/25!" disabled={step === "sending"} onClick={retake}><RefreshCw className="size-4" aria-hidden />{t("st.step.retake")}</Button>
                {step === "sending" && <span className="mx-auto"><Spinner label={t("st.sending")} /></span>}
              </div>
            </footer>
          )}
        </div>
      </div>
    );
  }

  return layer(
    <div role="dialog" aria-modal="true" aria-label={t("st.step.photo")} className="fixed inset-x-0 top-0 z-50 h-dvh overflow-hidden bg-navy text-white">
      <div className="mx-auto flex h-full max-w-md flex-col gap-3 px-4 pb-0 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={close} aria-label={t("st.step.cancel")} className="grid size-11 place-items-center rounded-control bg-white/15 hover:bg-white/25 disabled:opacity-50"><X className="size-5" aria-hidden /></button>
          <div><h2 className="text-lg font-bold">{t("st.step.photo")}</h2>
            <p className="text-sm text-white/75">{fill(t(kind === "in" ? "st.step.kind.in" : "st.step.kind.out"), { time: time(openedAt.current) })}</p></div>
        </header>

        {step === "locate" && (
          <div className="flex flex-1 flex-col justify-center gap-4" aria-live="polite">
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/12 p-6 text-center">
              <span className={`grid size-16 place-items-center rounded-full ${settled ? "bg-[#f2b64f]/25 text-[#f2b64f]" : "bg-white/15"}`}>
                {settled ? <TriangleAlert className="size-8" aria-hidden /> : <MapPin className="size-8" aria-hidden />}
              </span>
              <h3 className="text-xl font-bold">{settled ? t("st.locate.weak.title") : t("st.locate.title")}</h3>
              {settled ? (
                <>
                  <p className="text-white/85">{t(settled === "denied" ? "st.locate.denied.body" : "st.locate.weak.body")}</p>
                  {settled === "weak" && locating?.acc != null && <b>{fill(t("st.locate.acc"), { m: locating.acc })}</b>}
                </>
              ) : (
                <>
                  <b className="text-3xl">{locating?.acc != null ? fill(t("st.locate.acc"), { m: locating.acc }) : t("st.locate.none")}</b>
                  <p className="text-white/75">{fill(t("st.locate.waiting"), { m: TARGET_M })}</p>
                  <ProgressBar value={Math.round(((WAIT_S - (locating?.left ?? WAIT_S)) / WAIT_S) * 100)} label={t("st.locate.progress")} />
                  <span className="text-sm text-white/75">{fill(t("st.locate.countdown"), { s: locating?.left ?? WAIT_S })}</span>
                </>
              )}
            </div>
          </div>
        )}


        <div className="mt-auto flex shrink-0 flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step === "locate" && settled && (
            <div className="flex w-full flex-col gap-2">
              <Button variant="primary" className="h-14 w-full bg-white! text-lg text-ink! hover:bg-white/90!" onClick={() => setStep("camera")}><Camera className="size-5" aria-hidden />{t("st.locate.continue")}</Button>
              <Button className="w-full border-white/25! bg-white/15! text-white! hover:bg-white/25!" onClick={startGps}><RefreshCw className="size-4" aria-hidden />{t("st.locate.retry")}</Button>
            </div>
          )}
          {step === "locate" && !settled && (
            <Button disabled className="h-14 w-full border-white/25! bg-white/15! text-lg text-white!"><Camera className="size-5" aria-hidden />{t("st.locate.continue")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
