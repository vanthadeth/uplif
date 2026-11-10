import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "./cn";

function Shell({ icon, title, body, action, tone }: { icon: ReactNode; title: string; body?: string; action?: ReactNode; tone?: "danger" }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className={cn("inline-flex size-12 items-center justify-center rounded-full", tone === "danger" ? "bg-danger-soft text-danger" : "bg-neutral-soft text-muted")}>{icon}</span>
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export const EmptyState = ({ title, body, action }: { title: string; body?: string; action?: ReactNode }) => (
  <Shell icon={<Inbox className="size-6" aria-hidden="true" />} title={title} body={body} action={action} />
);

/** Say what happened and what to do next; never a bare "Error". */
export const ErrorState = ({ title, body, action }: { title: string; body?: string; action?: ReactNode }) => (
  <div role="alert"><Shell tone="danger" icon={<AlertTriangle className="size-6" aria-hidden="true" />} title={title} body={body} action={action} /></div>
);

export const Spinner = ({ label }: { label: string }) => (
  <span role="status" className="inline-flex items-center gap-2 text-muted">
    <Loader2 className="size-5 animate-[uplif-spin_0.8s_linear_infinite]" aria-hidden="true" />{label}
  </span>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn("animate-[uplif-pulse_1.4s_ease-in-out_infinite] rounded-control bg-line", className)} />
);
