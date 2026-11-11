import type { ReactNode } from "react";
import { cn } from "./cn";

/** Save / discard bar that floats above the page content as a rounded card with a shadow. Used by every edit form. */
export function FloatingBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 shadow-pop sm:bottom-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
