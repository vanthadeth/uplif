"use client";
import { useLayoutEffect, useState } from "react";
import { cn } from "./cn";

/** How long a bottom sheet takes to slide in. Keep the CSS duration in step with this. */
export const SHEET_SLIDE_MS = 320;
/** Slide-up with a soft landing; transform only, so it stays on the GPU. */
export const SHEET_SLIDE = "animate-[uplif-slide-up_0.32s_cubic-bezier(.2,.8,.2,1)] will-change-transform";

/**
 * True once a bottom sheet has finished sliding in. Heavy content is drawn only then, so nothing re-lays out or
 * flickers mid-slide. Where the sheet is not a sheet (wide screens) or motion is reduced, it is true straight away.
 * After a sheet has opened once it stays true while closed, so closing never tears the content down.
 */
export function useSheetReady(open: boolean, phoneMaxWidth = 639): boolean {
  const [ready, setReady] = useState(false);
  // Layout effect: on wide screens the flag flips before the first paint, so nothing is hidden even for a frame.
  useLayoutEffect(() => {
    if (!open) return;
    const phone = window.matchMedia(`(max-width: ${phoneMaxWidth}px)`).matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!phone || still) { setReady(true); return; }
    setReady(false);
    const t = window.setTimeout(() => setReady(true), SHEET_SLIDE_MS + 30);
    return () => window.clearTimeout(t);
  }, [open, phoneMaxWidth]);
  return ready;
}

/** Placeholder rows shown while a sheet slides. Reserves room so the sheet does not jump when content arrives. */
export function SheetSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="size-10 shrink-0 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-[10px] bg-line" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-full bg-line" style={{ width: `${70 - (i % 3) * 14}%` }} />
            <span className="h-3 w-1/3 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-full bg-line" />
          </span>
        </div>
      ))}
    </div>
  );
}
