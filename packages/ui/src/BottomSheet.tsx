"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button, type ButtonVariant } from "./Button";
import { cn } from "./cn";
import { SHEET_SLIDE_MS, SheetSkeleton } from "./Sheet";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Heading; also the accessible name. */
  title: string;
  closeLabel?: string;
  children: ReactNode;
  /** Sticky action row under the scrolling content. */
  footer?: ReactNode;
  /** Draw a skeleton instead of `children` until the sheet has landed (and while `loading` is true). */
  skeletonRows?: number;
  loading?: boolean;
  /** Where to mount. Inside a modal <dialog> pass the dialog, because a modal dialog makes the rest of the page inert. */
  container?: Element | null;
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
 * Heavy content is drawn only once the slide has landed; a skeleton holds the space until then.
 * On wide screens it is a centred panel of the same shape.
 */
export function BottomSheet({
  open, onClose, title, closeLabel = "Close", children, footer, skeletonRows = 4, loading = false, container, hideClose, className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [landed, setLanded] = useState(false);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const opener = useRef<Element | null>(null);

  // Mount on open; play the slide-out on close, then unmount.
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setMounted(true); setLeaving(false); setDrag(0); setLanded(false);
      const t = window.setTimeout(() => setLanded(true), SHEET_SLIDE_MS + 30);
      return () => window.clearTimeout(t);
    }
    if (!mounted) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setMounted(false); setLeaving(false); setDrag(0);
      (opener.current as HTMLElement | null)?.focus?.();
    }, CLOSE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock page scroll, close on Esc, move focus into the sheet.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", key, true);
    panel.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key, true); };
  }, [mounted, onClose]);

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

  if (!mounted) return null;
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
          {landed && !loading ? children : <SheetSkeleton rows={skeletonRows} />}
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
