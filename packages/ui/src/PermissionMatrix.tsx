"use client";
import { Check } from "lucide-react";
import { cn } from "./cn";
import { ScopePill, type DataScope } from "./Badge";

export interface PermissionRow {
  id: string;            // e.g. "people.users"
  label: string;
  actions: Record<string, boolean | null>; // true allowed, false not allowed, null not applicable
  scope: DataScope;
}

interface Props {
  rows: PermissionRow[];
  actions: { id: string; label: string }[];
  scopeLabels: Record<DataScope, string>;
  labels: { resource: string; scope: string; allowed: string; notAllowed: string; notApplicable: string; scopeGroup: string };
  onToggle: (rowId: string, actionId: string, next: boolean) => void;
  onScope: (rowId: string, scope: DataScope) => void;
  readOnly?: boolean;
}

const scopes: DataScope[] = ["own", "branch", "company"];

/** Role permissions: checkbox per action, plus one data scope per resource (widest wins on the server). */
export function PermissionMatrix({ rows, actions, scopeLabels, labels, onToggle, onScope, readOnly }: Props) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface" role="region" aria-label={labels.resource} tabIndex={0}>
      <table className="w-full border-collapse text-start">
        <thead className="bg-ground">
          <tr>
            <th scope="col" className="caps px-4 py-2.5 text-start text-xs font-semibold text-muted">{labels.resource}</th>
            {actions.map((a) => (
              <th key={a.id} scope="col" className="caps px-3 py-2.5 text-center text-xs font-semibold text-muted">{a.label}</th>
            ))}
            <th scope="col" className="caps px-4 py-2.5 text-start text-xs font-semibold text-muted">{labels.scope}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const any = Object.values(r.actions).some((v) => v === true);
            return (
              <tr key={r.id} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-start font-medium">{r.label}</th>
                {actions.map((a) => {
                  const v = r.actions[a.id];
                  return (
                    <td key={a.id} className="px-3 py-2 text-center">
                      {v === null || v === undefined ? (
                        <span className="text-check" aria-label={labels.notApplicable} role="img">–</span>
                      ) : (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={v}
                          aria-label={`${r.label}, ${a.label}: ${v ? labels.allowed : labels.notAllowed}`}
                          disabled={readOnly}
                          onClick={() => onToggle(r.id, a.id, !v)}
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-md border-[1.5px] transition-colors disabled:cursor-not-allowed",
                            v ? "border-primary bg-primary text-white" : "border-check bg-surface hover:border-ink-2",
                          )}
                        >
                          {v && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2">
                  {any ? (
                    readOnly ? (
                      <ScopePill scope={r.scope} label={scopeLabels[r.scope]} />
                    ) : (
                      <div role="radiogroup" aria-label={`${r.label}: ${labels.scopeGroup}`} className="inline-flex gap-1">
                        {scopes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={r.scope === s}
                            onClick={() => onScope(r.id, s)}
                            className={cn(
                              "min-h-8 rounded-full border px-2.5 text-xs font-semibold",
                              r.scope === s ? "border-primary bg-primary-soft text-primary-ink" : "border-line-strong text-muted hover:bg-ground",
                            )}
                          >
                            {scopeLabels[s]}
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <span className="text-check" aria-hidden="true">–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
