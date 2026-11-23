"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

export interface ConsentPoint {
  icon: ReactNode;
  text: string;
}

export interface ConsentDialogProps {
  open: boolean;
  /** "I understand": the caller saves the acceptance and closes. */
  onAccept: () => void;
  /** "Not now", Esc or a tap on the dimmed page: closes without saving. */
  onDismiss: () => void;
  title: string;
  /** Optional short lead-in above the points. */
  intro?: string;
  /** A few short points, each with an icon. */
  points: ConsentPoint[];
  acceptLabel: string;
  dismissLabel: string;
  /** Icon shown above the title. */
  icon?: ReactNode;
}

/**
 * Reusable consent notice: a centred dialog over a dimmed page with a short list of icon points.
 * Built on the native <dialog>, so the page behind is inert, focus is trapped and Esc closes it.
 * It never saves anything itself; callers decide when it opens (on first visit, and again before an
 * action that needs the consent) and where acceptance is stored.
 */
export function ConsentDialog({ open, onAccept, onDismiss, title, intro, points, acceptLabel, dismissLabel, icon }: ConsentDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="consent-title"
      onCancel={(e) => { e.preventDefault(); onDismiss(); }}
      onClick={(e) => { if (e.target === ref.current) onDismiss(); }}
      className="m-auto max-h-none w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-navy/50 backdrop:animate-[uplif-fade_0.2s_ease-out]"
    >
      <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-card bg-surface p-5 shadow-pop animate-[uplif-in_0.2s_ease-out]">
        {icon && <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary-ink" aria-hidden="true">{icon}</span>}
        <h2 id="consent-title" className="text-xl font-bold tracking-tight">{title}</h2>
        {intro && <p className="text-muted">{intro}</p>}
        <ul className="flex flex-col gap-3">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink" aria-hidden="true">{p.icon}</span>
              <span className="min-w-0 pt-1.5">{p.text}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 pt-1">
          <Button variant="primary" className="h-12 w-full text-[17px]" onClick={onAccept}>{acceptLabel}</Button>
          <Button variant="quiet" className="h-11 w-full" onClick={onDismiss}>{dismissLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
