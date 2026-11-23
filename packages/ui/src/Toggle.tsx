"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

export type ToggleProps = {
  checked: boolean;
  /** May return a promise: the knob then shows a spinner and the row is locked until it settles. A rejection shows `errorText`. */
  onChange: (v: boolean) => void | Promise<unknown>;
  label: string;
  /** Second line under the label. */
  description?: string;
  disabled?: boolean;
  /** Replaces the description while disabled, so people know why it is locked. */
  disabledReason?: string;
  /** Controlled saving state, for callers that run the save themselves. */
  saving?: boolean;
  /** Shown in red under the label when onChange rejects. */
  errorText?: string;
  /** Label before the switch in a content-width box (toolbars and filters) instead of a full-width row. */
  inline?: boolean;
  className?: string;
};

/**
 * Shared switch. Row layout: label and description at the start, 52x32 switch at the end, whole row at least 48px tall and tappable.
 * Colours come from tokens (`--toggle-knob`, `--toggle-check` flip in dark mode).
 */
export function Toggle({ checked, onChange, label, description, disabled, disabledReason, saving, errorText, inline, className }: ToggleProps) {
  const id = useId();
  const descId = useId();
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const busy = pending || !!saving;
  const shown = pending ? target : saving ? !checked : checked; // knob moves at once while saving
  const locked = disabled || busy;
  const failedNow = failed && !busy && !!errorText;
  const text = failedNow ? errorText : disabled && disabledReason ? disabledReason : description;

  function click() {
    if (locked) return;
    setFailed(false);
    const r = onChange(!checked);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setTarget(!checked);
      setPending(true);
      (r as Promise<unknown>).then(
        () => { if (alive.current) setPending(false); },
        () => { if (alive.current) { setPending(false); setFailed(true); } },
      );
    }
  }

  return (
    <div
      className={cn(
        "gap-4",
        inline ? "inline-flex items-center" : "flex min-h-14 w-full items-center justify-between",
        !locked && "cursor-pointer",
        className,
      )}
      onClick={(e) => { if ((e.target as HTMLElement).closest("button, label")) return; click(); }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("block font-medium", disabled ? "text-check" : "text-ink", !locked && "cursor-pointer")}>{label}</label>
        {text && (
          <p id={descId} role={failedNow ? "alert" : undefined} className={cn("m-0 mt-0.5 text-xs", failedNow ? "font-medium text-danger-ink" : disabled ? "text-check" : "text-muted")}>{text}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={shown}
        aria-busy={busy || undefined}
        aria-describedby={text ? descId : undefined}
        disabled={disabled}
        aria-disabled={locked || undefined}
        onClick={click}
        className={cn(
          "group relative h-8 w-[52px] shrink-0 rounded-full outline-offset-[3px] transition-colors duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          disabled ? (shown ? "bg-link/40" : "bg-line-strong") : shown ? "bg-link" : "bg-check",
        )}
      >
        <span
          className={cn(
            "absolute start-[3px] top-[3px] grid size-[26px] place-items-center rounded-full bg-[var(--toggle-knob)] shadow-[0_1px_3px_rgb(17_26_43/0.3)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            !locked && "group-active:scale-x-[1.08]",
            disabled && "opacity-80",
            shown ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0",
          )}
        >
          {busy ? (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="animate-[uplif-spin_0.8s_linear_infinite]">
              <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.25" className={shown ? "text-link" : "text-check"} />
              <path d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={shown ? "text-link" : "text-check"} />
            </svg>
          ) : shown ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={disabled ? "text-check" : "text-[var(--toggle-check)]"}>
              <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
      </button>
    </div>
  );
}
