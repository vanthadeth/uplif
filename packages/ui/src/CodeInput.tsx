"use client";
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "./cn";

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label: string;
  error?: string;
  disabled?: boolean;
}

/** One-time sign-in code. Digits only, paste-friendly, and autofills from SMS (one-time-code). */
export function CodeInput({ length = 6, value, onChange, onComplete, label, error, disabled }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }
  function setAt(i: number, d: string) {
    const arr = digits.slice();
    arr[i] = d;
    const clean = commit(arr.join(""));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  }
  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, "");
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  }
  function onPaste(e: ClipboardEvent) {
    e.preventDefault();
    const clean = commit(e.clipboardData.getData("text"));
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <div className="flex gap-2" dir="ltr">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            disabled={disabled}
            aria-label={`${label} ${i + 1}/${length}`}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v.length > 1) commit(v);
              else setAt(i, v);
            }}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-14 w-11 rounded-control border bg-surface text-center text-xl font-semibold tabular-nums sm:w-12",
              error ? "border-danger" : "border-line-strong",
            )}
          />
        ))}
      </div>
      {error && <span role="alert" className="text-xs text-danger-ink">{error}</span>}
    </div>
  );
}
