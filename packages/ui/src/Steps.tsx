"use client";
import { cn } from "./cn";

export interface StepItem { id: string; label: string }

/** A short row of numbered steps the person can jump between freely. Scrolls sideways on a narrow screen. */
export function Steps({ items, value, onChange, label }: { items: StepItem[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-2 overflow-x-auto">
      {items.map((s, i) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={on ? "step" : undefined}
            onClick={() => onChange(s.id)}
            className={cn(
              "flex min-h-12 min-w-max flex-1 items-center gap-2.5 rounded-card border px-3.5 py-1.5 font-semibold transition-colors",
              on ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-muted hover:bg-ground",
            )}
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[13px]", on ? "bg-primary text-white" : "bg-neutral-soft")}>{i + 1}</span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
