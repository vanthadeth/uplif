"use client";
import { useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { cn } from "./cn";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick: () => void;
  /** Red styling for destructive actions. */
  danger?: boolean;
}

/**
 * The "more" button for a list row. A row shows one main action; everything else goes here, in a bottom sheet
 * of large tappable rows. Keeps rows narrow on a phone, so the row never overflows the screen.
 */
export function ActionMenu({ items, title, label, closeLabel }: { items: ActionMenuItem[]; title: string; label: string; closeLabel?: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  // Let the sheet finish sliding out before the chosen action opens its own panel.
  const run = (fn: () => void) => { setOpen(false); window.setTimeout(fn, 240); };
  return (
    <>
      <button type="button" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}
        className="grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-primary-soft active:scale-95">
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} closeLabel={closeLabel}>
        <ul className="flex flex-col pb-2">
          {items.map((a) => (
            <li key={a.key}>
              <button type="button" onClick={() => run(a.onClick)}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left font-medium transition-colors", a.danger ? "text-danger hover:bg-danger-soft" : "hover:bg-primary-soft")}>
                <a.icon className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
