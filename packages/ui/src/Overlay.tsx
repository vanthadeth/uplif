"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Native <dialog>: focus trap, Esc to close and focus return come from the browser. */
function Overlay({ open, onClose, title, closeLabel = "Close", children, footer, side }: OverlayProps & { side?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="overlay-title"
      className={cn(
        "max-h-none bg-transparent p-0 backdrop:bg-navy/50",
        side ? "m-0 ms-auto h-dvh w-full max-w-md" : "m-auto w-[calc(100%-2rem)] max-w-lg",
      )}
    >
      <div
        className={cn(
          "flex flex-col bg-surface shadow-pop",
          side ? "h-dvh animate-[uplif-slide_0.2s_ease-out]" : "max-h-[85dvh] rounded-card animate-[uplif-in_0.15s_ease-out]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="overlay-title" className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="inline-flex size-9 items-center justify-center rounded-control text-muted hover:bg-ground">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </dialog>
  );
}

export const Modal = (p: OverlayProps) => <Overlay {...p} />;
export const SidePanel = (p: OverlayProps) => <Overlay {...p} side />;
