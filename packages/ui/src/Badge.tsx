import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-ink-2",
  info: "bg-primary-soft text-primary-ink",
} as const;
export type BadgeTone = keyof typeof tones;

/** Status is never colour alone: always pass a word as children. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export type DataScope = "own" | "branch" | "company";
const scopeTone: Record<DataScope, BadgeTone> = { own: "neutral", branch: "warning", company: "info" };

export function ScopePill({ scope, label }: { scope: DataScope; label: string }) {
  return <Badge tone={scopeTone[scope]}>{label}</Badge>;
}
