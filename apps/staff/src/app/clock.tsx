"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LogIn, LogOut, MapPin, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Spinner, useToast } from "@uplif/ui";
import type { Database } from "@uplif/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { languageOf } from "@/lib/languages";
import { LanguageBar } from "@/components/language-bar";

type State = Database["public"]["Functions"]["attendance_my_state"]["Returns"];
interface EventRow { id: string; kind: "in" | "out"; occurred_at: string; flags: string[] }
type Gps = { status: "getting" } | { status: "denied" } | { status: "ok"; lat: number; lon: number; acc: number };
type Step = "idle" | "camera" | "preview" | "sending";

const FLAG_KEYS: Record<string, MessageKey> = {
  outside_geofence: "st.flag.outside_geofence", no_gps: "st.flag.no_gps", low_accuracy: "st.flag.low_accuracy",
  clock_drift: "st.flag.clock_drift", missing_selfie: "st.flag.missing_selfie", shared_device: "st.flag.shared_device",
};

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};
const deviceId = () => {
  let id = store.get("uplif.staff.device");
  if (!id) { id = crypto.randomUUID(); store.set("uplif.staff.device", id); }
  return id;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function Clock({ initial: state, recent }: { initial: State; recent: EventRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const tag = languageOf(locale).dateTag;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const when = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short" }) + " " + time(iso);

  const [step, setStep] = useState<Step>("idle");
  const [privacyOk, setPrivacyOk] = useState(true);
  const [cameraError, setCameraError] = useState<"" | "denied" | "none">("");
  const [gps, setGps] = useState<Gps>({ status: "getting" });
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ kind: "in" | "out"; at: string; flags: string[] } | null>(null);
  const [online, setOnline] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptRef = useRef<string>("");

  useEffect(() => { setPrivacyOk(store.get("uplif.staff.privacy") === "1"); }, []);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    addEventListener("online", sync); addEventListener("offline", sync);
    return () => { removeEventListener("online", sync); removeEventListener("offline", sync); };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => { return () => { if (photo) URL.revokeObjectURL(photo.url); }; }, [photo]);

  const clockedIn = state.last?.kind === "in";
  const kind: "in" | "out" = clockedIn ? "out" : "in";

  async function startCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch (e) {
      setCameraError((e as DOMException)?.name === "NotFoundError" ? "none" : "denied");
    }
  }
  function startGps() {
    setGps({ status: "getting" });
    if (!navigator.geolocation) return setGps({ status: "denied" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ status: "ok", lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => setGps({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  function open() {
    setError(""); setDone(null); setPhoto(null);
    attemptRef.current = crypto.randomUUID();
    setStep("camera");
    startGps();
  }
  useEffect(() => { if (step === "camera") void startCamera(); }, [step]);

  function close() { stopCamera(); setPhoto(null); setStep("idle"); }

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
    setDone({ kind: data.kind, at: data.occurred_at, flags: data.flags });
    toast("success", fill(t(data.kind === "in" ? "st.done.in" : "st.done.out"), { time: time(data.occurred_at) }));
    close();
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }

  const name = (locale !== "en" && state.employee_name_local) || state.employee_name || "";
  const branch = state.branch ? ((locale !== "en" && state.branch.name_local) || state.branch.name) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{fill(t("st.hello"), { name })}</h1>
          <p className="flex items-center gap-1 text-muted"><MapPin className="size-4 shrink-0" aria-hidden />{branch ?? t("st.noBranch")}</p>
        </div>
        <LanguageBar />
      </header>

      {!privacyOk && (
        <Card><CardBody className="flex flex-col gap-3">
          <b>{t("st.privacy.title")}</b>
          <p className="text-muted">{t("st.privacy.body")}</p>
          <Button variant="primary" onClick={() => { store.set("uplif.staff.privacy", "1"); setPrivacyOk(true); }}>{t("st.privacy.ok")}</Button>
        </CardBody></Card>
      )}

      <Card>
        <CardBody className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted" aria-live="polite">
            {clockedIn && state.last ? fill(t("st.status.in"), { time: time(state.last.occurred_at) })
              : state.last ? fill(t("st.status.lastOut"), { time: time(state.last.occurred_at) }) : t("st.status.out")}
          </p>
          <Button variant={clockedIn ? "secondary" : "primary"} disabled={!privacyOk || !online}
            className="min-h-16 w-full text-lg" onClick={open}>
            {clockedIn ? <LogOut className="size-6" aria-hidden /> : <LogIn className="size-6" aria-hidden />}
            {t(clockedIn ? "st.clockOut" : "st.clockIn")}
          </Button>
          {!online && <p role="status" className="text-warning-ink">{t("st.offline")}</p>}
          {done && (
            <div role="status" className="w-full rounded-control bg-success-soft p-3 text-success-ink">
              {fill(t(done.kind === "in" ? "st.done.in" : "st.done.out"), { time: time(done.at) })}
              {done.flags.length > 0 && (
                <div className="mt-2 text-warning-ink">
                  <b className="block">{t("st.done.flagged")}</b>
                  <ul className="list-disc pl-5 text-left">{done.flags.map((f) => <li key={f}>{FLAG_KEYS[f] ? t(FLAG_KEYS[f]) : f}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("st.recent")} />
        {recent.length === 0 ? <CardBody className="text-muted">{t("st.recent.empty")}</CardBody> : (
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex items-center gap-2"><Badge tone={r.kind === "in" ? "success" : "neutral"}>{t(r.kind === "in" ? "st.kind.in" : "st.kind.out")}</Badge>{when(r.occurred_at)}</span>
                {r.flags.length > 0 && <Badge tone="warning">{t("st.review")}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-center"><Button variant="quiet" onClick={signOut}>{t("st.signOut")}</Button></div>

      {step !== "idle" && (
        <div role="dialog" aria-modal="true" aria-label={t("st.step.photo")} className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-surface p-4">
          <h2 className="text-lg font-bold">{t("st.step.photo")}</h2>
          <p className="text-muted">{t("st.step.photoBody")}</p>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-card bg-navy">
            {step === "camera" && (
              <>
                <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
                {!cameraError && <span className="absolute inset-x-0 top-2 text-center text-sm text-white/80">{t("st.camera.starting")}</span>}
              </>
            )}
            {photo && step !== "camera" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo.url} alt="" className="size-full -scale-x-100 object-cover" />}
          </div>
          {cameraError && <p role="alert" className="text-danger-ink">{t(cameraError === "none" ? "st.camera.none" : "st.camera.denied")}</p>}
          <p className="flex items-start gap-2 text-sm text-muted" aria-live="polite">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {gps.status === "getting" ? t("st.gps.getting")
              : gps.status === "denied" ? t("st.gps.denied")
              : gps.acc > 100 ? t("st.gps.weak") : fill(t("st.gps.ok"), { m: gps.acc })}
          </p>
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
          <div className="mt-auto flex flex-col gap-2">
            {step === "camera" && <Button variant="primary" disabled={!!cameraError} onClick={take}><Camera className="size-5" aria-hidden />{t("st.step.take")}</Button>}
            {(step === "preview" || step === "sending") && (
              <>
                <Button variant="primary" loading={step === "sending"} onClick={send}>{t(kind === "in" ? "st.step.send" : "st.step.sendOut")}</Button>
                <Button disabled={step === "sending"} onClick={retake}><RefreshCw className="size-4" aria-hidden />{t("st.step.retake")}</Button>
              </>
            )}
            {step === "sending" && <Spinner label={t("st.sending")} />}
            <Button variant="quiet" disabled={step === "sending"} onClick={close}>{t("st.step.cancel")}</Button>
          </div>
        </div>
      )}
    </main>
  );
}
