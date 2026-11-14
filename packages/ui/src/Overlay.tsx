"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";
import { BottomSheet } from "./BottomSheet";
import { SheetSkeleton, useIsPhone, useSheetReady } from "./Sheet";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Native <dialog>: focus trap, Esc to close and focus return come from the browser. */
function Overlay({ open, onClose, title, closeLabel = "Close", children, footer, side, sheet }: OverlayProps & { side?: boolean; sheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const slid = useSheetReady(open);
  const asSheet = !!(side && sheet);
  const phone = useIsPhone();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Phones get the shared bottom sheet: the last footer button is the wide primary action.
  if (asSheet && phone) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={title}
        closeLabel={closeLabel}
        footer={footer && <div className="flex w-full gap-2 [&>*:last-child]:h-12 [&>*:last-child]:flex-1 [&>*:last-child]:text-[17px]">{footer}</div>}
      >
        {children}
      </BottomSheet>
    );
  }
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="overlay-title"
      className={cn(
        "max-h-none bg-transparent p-0 backdrop:bg-navy/50",
        side ? "m-0 ms-auto h-dvh w-full max-w-md" : "m-auto w-[calc(100%-2rem)] max-w-lg",
        side && sheet && "max-sm:mt-auto max-sm:h-fit max-sm:max-w-none",
      )}
    >
      <div
        className={cn(
          "flex flex-col bg-surface shadow-pop",
          side ? "h-dvh animate-[uplif-slide_0.2s_ease-out]" : "max-h-[85dvh] rounded-card animate-[uplif-in_0.15s_ease-out]",
          side && sheet && "max-sm:h-auto max-sm:rounded-t-card max-sm:max-h-[90dvh] max-sm:animate-[uplif-slide-up_0.32s_cubic-bezier(.2,.8,.2,1)] max-sm:will-change-transform",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="overlay-title" className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="inline-flex size-9 items-center justify-center rounded-control text-muted hover:bg-ground">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className={cn("flex-1 overflow-y-auto p-5", asSheet && "max-sm:min-h-[42dvh] max-sm:overscroll-contain max-sm:pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.5rem))]")}>
          {asSheet && !slid ? <SheetSkeleton /> : children}
        </div>
        {footer && <div className={cn("flex justify-end gap-2 border-t border-line px-5 py-3.5", asSheet && "max-sm:pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))]")}>{footer}</div>}
      </div>
    </dialog>
  );
}

export const Modal = (p: OverlayProps) => <Overlay {...p} />;
/** Right-hand panel; with `sheet` it becomes a bottom sheet on phones. */
export const SidePanel = (p: OverlayProps & { sheet?: boolean }) => <Overlay {...p} side />;
