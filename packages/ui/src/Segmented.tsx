"use client";
import { cn } from "./cn";

export interface SegmentItem { id: string; label: string }

/** A small joined group of buttons for choosing one of a few presets. Pass `value` null when none applies (custom). */
export function Segmented({ items, value, onChange, label, disabled }: {
  items: SegmentItem[]; value: string | null; onChange: (id: string) => void; label: string; disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-control border border-line-strong">
      {items.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(s.id)}
            className={cn(
              "min-h-10 border-s border-line-strong px-3 transition-colors first:border-s-0 disabled:opacity-50",
              on ? "bg-primary-soft font-semibold text-primary-ink" : "bg-surface hover:bg-ground",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
