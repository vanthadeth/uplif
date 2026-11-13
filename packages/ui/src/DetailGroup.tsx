import type { ReactNode } from "react";
import { Card } from "./Card";
import { cn } from "./cn";

/** A titled card of label and value rows (profile details). `action` sits beside the title, for example an Edit button. */
export function DetailGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-3 px-1">
        <h2 className="m-0 text-sm font-semibold text-muted">{title}</h2>
        {action}
      </div>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

/** One row: a label, the main value, an optional second line, and an optional action such as a call button. */
export function DetailRow({ label, value, sub, empty, action, className }: {
  label: string; value?: ReactNode; sub?: ReactNode; empty: string; action?: ReactNode; className?: string;
}) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className={cn("flex min-h-14 items-center gap-3 px-4 py-2.5", className)}>
      <span className="w-28 shrink-0 text-sm text-muted">{label}</span>
      <div className="min-w-0 flex-1">
        <b className={cn("block [overflow-wrap:anywhere]", !has && "font-normal text-muted")}>{has ? value : empty}</b>
        {has && sub ? <span className="block text-sm text-muted [overflow-wrap:anywhere]">{sub}</span> : null}
      </div>
      {action}
    </div>
  );
}

/** A round icon link for a quick action (call, message). Needs an accessible name. */
export function QuickAction({ href, label, children, external }: { href: string; label: string; children: ReactNode; external?: boolean }) {
  return (
    <a href={href} aria-label={label} title={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink transition-colors hover:bg-primary-soft/70 focus-visible:outline-2 focus-visible:outline-offset-2">
      {children}
    </a>
  );
}
