import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

/** Fades and lifts its content in when it first appears. Pass a delay (ms) to stagger the rows of a list. Reduced-motion users get no animation (see theme.css). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const style: CSSProperties | undefined = delay ? { animationDelay: `${Math.min(delay, 400)}ms` } : undefined;
  return <div style={style} className={cn("animate-[uplif-in_240ms_ease-out_both]", className)}>{children}</div>;
}

const fills = { primary: "bg-primary", success: "bg-success", warning: "bg-warning" } as const;

/** A progress bar whose fill slides to its value. `label` is read out by screen readers. */
export function ProgressBar({ value, label, tone = "primary", className }: { value: number; label: string; tone?: keyof typeof fills; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-2 overflow-hidden rounded-full bg-neutral-soft", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fills[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
