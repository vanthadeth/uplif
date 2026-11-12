"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, MapPin, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button, Spinner } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { deviceId } from "@/lib/store";
import { distanceM, ymd } from "@/lib/format";
import { useMe, useDisplay } from "./me-context";

type Gps = { status: "getting" } | { status: "denied" } | { status: "ok"; lat: number; lon: number; acc: number };
type Step = "camera" | "preview" | "sending" | "done";

const FLAG_KEYS: Record<string, MessageKey> = {
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

  const [step, setStep] = useState<Step>("camera");
  const [cameraError, setCameraError] = useState<"" | "denied" | "none">("");
  const [gps, setGps] = useState<Gps>({ status: "getting" });
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ at: string; flags: string[] } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptRef = useRef<string>("");
  const openedAt = useRef(new Date());

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);
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
  const startGps = useCallback(() => {
    setGps({ status: "getting" });
    if (!navigator.geolocation) return setGps({ status: "denied" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ status: "ok", lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => setGps({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);

  useEffect(() => {
    attemptRef.current = crypto.randomUUID();
    startGps();
  }, [startGps]);
  useEffect(() => { if (step === "camera") void startCamera(); }, [step, startCamera]);

  function close() { stopCamera(); setPhoto(null); onClose(); }

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
    const path = `${state.company_id}/${state.employee_id}/${ymd(new Date())}/${eventId}.jpg`;
    const up = await supabase.storage.from("attendance-selfies").upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
    if (up.error && !/exist|duplicate/i.test(up.error.message)) { setError(t("st.err.upload")); setStep("preview"); return; }
    const g = gps.status === "ok" ? gps : null;
    const { data, error: err } = await supabase.rpc("attendance_clock", {
      p_kind: kind, p_client_event_id: eventId, p_device_time: new Date().toISOString(),
      p_latitude: g ? g.lat : null, p_longitude: g ? g.lon : null, p_accuracy_m: g ? g.acc : null,
      p_selfie_path: path, p_device_id: deviceId(),
    });
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

  if (step === "done" && done) {
    const outside = done.flags.includes("outside_geofence");
    return (
      <div role="dialog" aria-modal="true" aria-label={t(kind === "in" ? "st.done.in" : "st.done.out")} className="fixed inset-0 z-50 overflow-y-auto bg-ground">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-22 place-items-center rounded-full bg-success-soft text-success-ink"><Check className="size-11" aria-hidden /></span>
            <h1 className="text-2xl font-bold tracking-tight">{fill(t(kind === "in" ? "st.done.in" : "st.done.out"), { time: time(done.at) })}</h1>
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

  return (
    <div role="dialog" aria-modal="true" aria-label={t("st.step.photo")} className="fixed inset-0 z-50 overflow-y-auto bg-navy text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
        <header className="flex items-center gap-3">
          <button type="button" onClick={close} disabled={step === "sending"} aria-label={t("st.step.cancel")} className="grid size-11 place-items-center rounded-control bg-white/15 hover:bg-white/25 disabled:opacity-50"><X className="size-5" aria-hidden /></button>
          <div><h2 className="text-lg font-bold">{t("st.step.photo")}</h2>
            <p className="text-sm text-white/75">{fill(t(kind === "in" ? "st.step.kind.in" : "st.step.kind.out"), { time: time(openedAt.current) })}</p></div>
        </header>

        <div className="relative mx-auto aspect-3/4 w-full flex-1 overflow-hidden rounded-3xl bg-[#141c30]" style={{ maxHeight: "58dvh" }}>
          {step === "camera" && (
            <>
              <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
              {!cameraError && (
                <>
                  <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 aspect-3/4 w-[62%] -translate-x-1/2 -translate-y-[52%] rounded-full border-[3px] border-dashed border-white/75" />
                  <span className="absolute inset-x-0 bottom-3 text-center text-sm">{t("st.step.hint")}</span>
                </>
              )}
            </>
          )}
          {photo && step !== "camera" && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full -scale-x-100 object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-success-soft px-3 py-0.5 text-xs font-semibold text-success-ink">{t("st.step.taken")}</span>
            </>
          )}
        </div>
        {cameraError && <p role="alert" className="rounded-card bg-danger-soft p-3 text-danger-ink">{t(cameraError === "none" ? "st.camera.none" : "st.camera.denied")}</p>}

        <p className="flex items-start gap-3 rounded-card bg-white/12 p-3" aria-live="polite">
          <MapPin className={`mt-0.5 size-5 shrink-0 ${gpsGood ? "text-[#7be0a5]" : gps.status === "getting" ? "text-white/70" : "text-[#f2b64f]"}`} aria-hidden />
          <span><b className="block text-sm">{gpsTitle}</b>{gpsSub && <span className="text-xs text-white/75">{gpsSub}</span>}</span>
        </p>

        {error && <p role="alert" className="rounded-card bg-danger-soft p-3 text-danger-ink">{error}</p>}

        <div className="mt-auto flex flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step === "camera" && (
            <>
              <button type="button" disabled={!!cameraError} onClick={take} aria-label={t("st.step.take")} className="grid size-19 place-items-center rounded-full border-4 border-white disabled:opacity-40"><span className="size-14 rounded-full bg-white" /></button>
              <span className="text-sm text-white/75">{t("st.step.take")}</span>
            </>
          )}
          {(step === "preview" || step === "sending") && (
            <div className="flex w-full flex-col gap-2">
              <Button variant="primary" className="h-14 w-full bg-white! text-lg text-ink! hover:bg-white/90!" loading={step === "sending"} onClick={send}>{t(kind === "in" ? "st.step.send" : "st.step.sendOut")}</Button>
              <Button className="w-full border-white/25! bg-white/15! text-white! hover:bg-white/25!" disabled={step === "sending"} onClick={retake}><RefreshCw className="size-4" aria-hidden />{t("st.step.retake")}</Button>
              {step === "sending" && <span className="mx-auto"><Spinner label={t("st.sending")} /></span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
