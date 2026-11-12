"use client";
import { useId } from "react";
import { cn } from "./cn";

/**
 * The switch control on its own (no visible label). Give it an accessible name with `label`.
 * 44x24 track, 20px knob fully inside it, 44px-high hit area (invisible). Off = grey track, on = primary track
 * with a check mark in the knob so the state never relies on colour alone.
 */
export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        // before: invisible 44px-high hit area around the 24px track
        "relative block h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] motion-reduce:transition-none",
        checked ? "bg-primary" : "bg-switch-off",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(17_26_43/0.35)] transition-[inset-inline-start] duration-150 ease-out motion-reduce:transition-none",
          checked ? "start-[22px]" : "start-0.5",
        )}
      >
        <svg viewBox="0 0 12 12" aria-hidden className={cn("size-3 text-primary transition-opacity duration-150 motion-reduce:transition-none", checked ? "opacity-100" : "opacity-0")}>
          <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="inline-flex items-center gap-3">
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
      <label htmlFor={id} className={cn("font-medium", disabled ? "cursor-not-allowed text-muted" : "cursor-pointer")}>{label}</label>
    </div>
  );
}
