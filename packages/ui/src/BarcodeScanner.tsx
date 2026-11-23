"use client";
import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Modal } from "./Overlay";
import { Button } from "./Button";
import { cn } from "./cn";

/** The browser's built-in barcode reader. Not in every browser, so the app must always keep a typing fallback. */
interface Detector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type DetectorCtor = (new (opts?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

/** True when this browser can scan with the camera. Without the built-in reader (iPhone Safari) a bundled reader is loaded on demand. */
export function canScanBarcodes(): boolean {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return "BarcodeDetector" in window || typeof WebAssembly === "object";
}

/** The built-in reader when there is one, otherwise the bundled one. The bundled reader fetches its engine from wasmUrl (same site, so it also works offline). */
async function loadDetectorCtor(wasmUrl = "/zxing_reader.wasm"): Promise<DetectorCtor> {
  if ("BarcodeDetector" in window) return (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
  const mod = await import("barcode-detector/ponyfill");
  mod.setZXingModuleOverrides({ locateFile: (name: string, prefix: string) => (name.endsWith(".wasm") ? wasmUrl : prefix + name) });
  return mod.BarcodeDetector as unknown as DetectorCtor;
}

export interface BarcodeScannerLabels {
  title: string; close: string; cancel: string;
  /** Shown while the camera starts. */
  starting: string;
  /** Shown while the camera is running. */
  aim: string;
  /** Camera blocked or missing. */
  denied: string;
  /** This browser cannot read barcodes. */
  unsupported: string;
}

/**
 * Camera barcode scanner in a dialog. Calls onScan once with the first code it reads, then closes itself.
 * The camera is only on while the dialog is open and is always switched off again.
 */
export function BarcodeScanner({ open, onClose, onScan, labels, wasmUrl }: {
  open: boolean; onClose: () => void; onScan: (code: string) => void; labels: BarcodeScannerLabels;
  /** Where the bundled reader's engine file is served from (default /zxing_reader.wasm, which an app copies into its public folder). Only used in browsers without a built-in reader. */
  wasmUrl?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} closeLabel={labels.close} title={labels.title}
      footer={<Button onClick={onClose}>{labels.cancel}</Button>}>
      {open && <ScannerBody onClose={onClose} onScan={onScan} labels={labels} wasmUrl={wasmUrl} />}
    </Modal>
  );
}

function ScannerBody({ onClose, onScan, labels, wasmUrl }: { onClose: () => void; onScan: (code: string) => void; labels: BarcodeScannerLabels; wasmUrl?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "denied" | "unsupported">(canScanBarcodes() ? "starting" : "unsupported");
  // Latest callbacks without restarting the camera when the parent re-renders.
  const cb = useRef({ onClose, onScan });
  cb.current = { onClose, onScan };

  useEffect(() => {
    if (!canScanBarcodes()) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const el = video.current;
        if (!el) return;
        el.srcObject = stream;
        await el.play();
        setState("live");
        const Ctor = await loadDetectorCtor(wasmUrl);
        if (stopped) return;
        const supported = (await Ctor.getSupportedFormats?.().catch(() => undefined)) ?? undefined;
        const detector = supported?.length ? new Ctor({ formats: supported }) : new Ctor();
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(el);
            const code = found.map((f) => f.rawValue.trim()).find(Boolean);
            if (code) { stopped = true; cb.current.onScan(code); cb.current.onClose(); return; }
          } catch { /* a frame that cannot be read is skipped */ }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        if (!stopped) setState("denied");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (state === "unsupported" || state === "denied") {
    return <p role="alert" className="py-6 text-center text-muted">{state === "denied" ? labels.denied : labels.unsupported}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-navy">
        <video ref={video} muted playsInline className={cn("size-full object-cover transition-opacity duration-200", state === "live" ? "opacity-100" : "opacity-0")} />
        {state === "live" && <span aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary/80" />}
      </div>
      <p role="status" className="text-center text-muted">{state === "live" ? labels.aim : labels.starting}</p>
    </div>
  );
}

/** Small icon button that opens a scanner. Hidden where the browser cannot scan, so typing stays the only path there. */
export function ScanButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(canScanBarcodes()), []);
  if (!ok) return null;
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn("grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft", className)}>
      <ScanLine className="size-5" aria-hidden />
    </button>
  );
}
