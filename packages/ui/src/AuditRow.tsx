"use client";
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { cn } from "./cn";

export interface AuditChange { field: string; before: string | null; after: string | null }
export interface AuditEntry {
  id: string;
  when: string;
  actor: string;
  action: string;      // already-translated verb, e.g. "Updated role"
  actionTone: BadgeTone;
  target: string;
  changes: AuditChange[];
  meta?: { label: string; value: string }[]; // IP, device, branch...
}

/** Expandable audit log row showing a before/after diff. The audit log is append-only: no edit actions here. */
export function AuditRow({ entry, labels }: { entry: AuditEntry; labels: { before: string; after: string; field: string; empty: string; toggle: string } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${labels.toggle}: ${entry.actor}, ${entry.action}, ${entry.target}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-start hover:bg-ground/60"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted transition-transform rtl:-scale-x-100", open && "rotate-90 rtl:rotate-90")} aria-hidden="true" />
        <time className="w-40 shrink-0 text-muted">{entry.when}</time>
        <span className="w-32 shrink-0 font-medium">{entry.actor}</span>
        <Badge tone={entry.actionTone}>{entry.action}</Badge>
        <span className="min-w-0 flex-1 truncate">{entry.target}</span>
      </button>
      <div id={id} hidden={!open} className="bg-ground/60 px-4 pb-4 ps-12">
        <div className="overflow-x-auto rounded-control border border-line bg-surface">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="caps text-xs text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">{labels.field}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{labels.before}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{labels.after}</th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((c) => (
                <tr key={c.field} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-start font-medium">{c.field}</th>
                  <td className="px-3 py-2"><span className="rounded bg-danger-soft px-1.5 text-danger-ink">{c.before ?? labels.empty}</span></td>
                  <td className="px-3 py-2"><span className="rounded bg-success-soft px-1.5 text-success-ink">{c.after ?? labels.empty}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entry.meta && (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            {entry.meta.map((m) => (
              <div key={m.label} className="flex gap-1.5"><dt>{m.label}:</dt><dd className="text-ink-2">{m.value}</dd></div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

export function AuditList({ children, label }: { children: React.ReactNode; label: string }) {
  return <ul aria-label={label} className="overflow-hidden rounded-card border border-line bg-surface">{children}</ul>;
}
