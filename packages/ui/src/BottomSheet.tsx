"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button, type ButtonVariant } from "./Button";
import { cn } from "./cn";
import { Loader2 } from "lucide-react";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Heading; also the accessible name. */
  title: string;
  closeLabel?: string;
  children: ReactNode;
  /** Sticky action row under the scrolling content. */
  footer?: ReactNode;
  /**
   * True while the sheet's own data is still loading. The sheet does not open yet: a small waiting indicator shows
   * over the dimmed page, and the sheet slides up with its content in place once `loading` turns false.
   * Pictures and other external files must not be waited on: let them load in with their own skeletons.
   */
  loading?: boolean;
  /** Accessible text for the waiting indicator. */
  loadingLabel?: string;
  /** Show the waiting indicator only after this long, so a fast load never flashes it. */
  waitDelayMs?: number;
  /** Where to mount. Inside a modal <dialog> pass the dialog, because a modal dialog makes the rest of the page inert. */
  container?: Element | null;
  /** Move focus into the sheet on open. Turn off when focus must stay where it is (a list driven from its own button). */
  autoFocus?: boolean;
  /** Hide the close button (the handle, backdrop tap, drag and Esc still close). */
  hideClose?: boolean;
  className?: string;
}

const CLOSE_MS = 220;
const DISMISS_PX = 90;
const DISMISS_VELOCITY = 0.6; // px per ms

/**
 * Reusable slide-up panel. Slides in with a soft landing, slides out on close, drags down to dismiss,
 * closes on backdrop tap or Esc, keeps the page from scrolling behind it, and respects the phone's safe area.
 * It opens only once its content is ready (`loading` false); until then a waiting indicator is shown.
 * On wide screens it is a centred panel of the same shape.
 */
export function BottomSheet({
  open, onClose, title, closeLabel = "Close", children, footer, loading = false, loadingLabel = "Loading", waitDelayMs = 150, container, hideClose, autoFocus = true, className,
}: BottomSheetProps) {
  // The sheet itself opens only when `open` and not `loading`; `waiting` covers the gap.
  const want = open && !loading;
  const [mounted, setMounted] = useState(want);
  const [leaving, setLeaving] = useState(false);
  const [waitShown, setWaitShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const opener = useRef<Element | null>(null);

  // Mount on open; play the slide-out on close, then unmount.
  useEffect(() => {
    if (want) {
      setMounted(true); setLeaving(false); setDrag(0);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setMounted(false); setLeaving(false); setDrag(0);
      (opener.current as HTMLElement | null)?.focus?.();
    }, CLOSE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  // Remember what had focus when the user asked to open, even while waiting.
  useEffect(() => { if (open && !mounted) opener.current = document.activeElement; }, [open, mounted]);

  // Waiting indicator: appears after a short delay, and only while an open request is held back by loading.
  const waiting = open && loading && !mounted;
  useEffect(() => {
    if (!waiting) { setWaitShown(false); return; }
    const t = window.setTimeout(() => setWaitShown(true), waitDelayMs);
    return () => window.clearTimeout(t);
  }, [waiting, waitDelayMs]);

  // Lock page scroll, close on Esc, move focus into the sheet.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Bubble phase, and skip when something inside (an open list) already handled Esc.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    document.addEventListener("keydown", key);
    if (autoFocus) panel.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [mounted, onClose, autoFocus]);

  const down = useCallback((e: React.PointerEvent) => {
    start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const move = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  }, []);
  const up = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dy = e.clientY - s.y;
    const v = dy / Math.max(1, performance.now() - s.t);
    if (dy > DISMISS_PX || (dy > 24 && v > DISMISS_VELOCITY)) onClose(); else setDrag(0);
  }, [onClose]);

  if (!mounted) {
    if (!waiting || !waitShown) return null;
    return createPortal(
      <div
        className="fixed inset-0 z-[100] grid place-items-center animate-[uplif-fade_0.2s_ease-out]"
        style={{ backgroundColor: "rgb(17 26 43 / 0.5)" }}
        onPointerDown={onClose}
      >
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-full bg-surface px-5 py-3 text-sm font-medium shadow-pop animate-[uplif-in_0.15s_ease-out]">
          <Loader2 className="size-5 animate-[uplif-spin_0.8s_linear_infinite] text-primary" aria-hidden="true" />
          {loadingLabel}
        </div>
      </div>,
      container ?? document.body,
    );
  }
  const host = container ?? document.body;
  const dragging = start.current !== null;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[100] flex items-end justify-center sm:items-center", leaving ? "animate-[uplif-fade-out_0.22s_ease-in_forwards]" : "animate-[uplif-fade_0.2s_ease-out]")}
      style={{ backgroundColor: "rgb(17 26 43 / 0.5)" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: dragging ? "none" : undefined } : undefined}
        className={cn(
          "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-card bg-surface shadow-pop outline-none will-change-transform sm:max-w-lg sm:rounded-card",
          leaving ? "animate-[uplif-slide-down_0.22s_ease-in_forwards]" : "animate-[uplif-slide-up_0.32s_cubic-bezier(.2,.8,.2,1)]",
          className,
        )}
      >
        {/* Handle + header are the drag area. */}
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="touch-none select-none">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            {!hideClose && (
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label={closeLabel} className="inline-flex size-9 items-center justify-center rounded-control text-muted hover:bg-ground">
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-[30dvh] flex-1 overflow-y-auto overscroll-contain border-t border-line px-5 pt-4 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))]">
          {children}
        </div>
        {footer && (
          <div className="flex items-stretch gap-2 border-t border-line px-5 pt-3.5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))]">{footer}</div>
        )}
      </div>
    </div>,
    host,
  );
}

export interface SheetActionsProps {
  /** The main action: fills the row and is the larger button. */
  primary: { label: string; onClick?: () => void; variant?: ButtonVariant; loading?: boolean; disabled?: boolean; type?: "button" | "submit" };
  /** Other actions: icon-only square buttons beside the primary one. `label` is the accessible name. */
  secondary?: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }[];
}

/** Footer row for a BottomSheet: one wide primary button, any other actions icon-only. Pass as `footer`. */
export function SheetActions({ primary, secondary = [] }: SheetActionsProps) {
  return (
    <>
      {secondary.map((a) => (
        <Button key={a.label} aria-label={a.label} title={a.label} onClick={a.onClick} disabled={a.disabled} className="size-12 shrink-0 !px-0">
          {a.icon}
        </Button>
      ))}
      <Button variant={primary.variant ?? "primary"} type={primary.type} onClick={primary.onClick} loading={primary.loading} disabled={primary.disabled} className="h-12 flex-1 text-[17px]">
        {primary.label}
      </Button>
    </>
  );
}
