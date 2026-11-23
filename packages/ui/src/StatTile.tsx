import type { ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./States";

const tones = {
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-ink-2",
  info: "bg-primary-soft text-primary-ink",
} as const;
export type StatTone = keyof typeof tones;

/**
 * One number with its meaning: a coloured icon badge, a big value, a label and a short hint. The colour never says it
 * alone, the label does. `onClick` makes it a button (a filter, for example); `loading` shows the same shape as a skeleton.
 */
export function StatTile({ icon, value, label, hint, tone = "neutral", onClick, pressed, loading }: {
  icon: ReactNode; value: ReactNode; label: string; hint?: string; tone?: StatTone; onClick?: () => void; pressed?: boolean; loading?: boolean;
}) {
  const body = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-control", tones[tone])} aria-hidden="true">{icon}</span>
      {loading ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-hidden="true"><Skeleton className="h-6 w-10" /><Skeleton className="h-3.5 w-16" /></span>
      ) : (
        <span className="flex min-w-0 flex-col">
          <b className="text-2xl leading-tight tabular-nums">{value}</b>
          <span className="truncate text-sm font-semibold">{label}</span>
          {hint && <span className="truncate text-xs text-muted">{hint}</span>}
        </span>
      )}
    </>
  );
  const cls = cn("flex min-h-19 items-center gap-3 rounded-card border border-line bg-surface p-3 text-start", pressed && "border-primary");
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={cn(cls, "transition-colors active:bg-neutral-soft")}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
