"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem { id: string; label: string }

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs. Render panels yourself with role="tabpanel". */
export function Tabs({ items, value, onChange, label }: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: KeyboardEvent) {
    const i = items.findIndex((t) => t.id === value);
    const dir = getComputedStyle(e.currentTarget as Element).direction === "rtl" ? -1 : 1;
    let n = -1;
    if (e.key === "ArrowRight") n = (i + dir + items.length) % items.length;
    else if (e.key === "ArrowLeft") n = (i - dir + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].id);
    refs.current[items[n].id]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 border-b border-line">
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px min-h-(--control-h) border-b-2 px-4 font-semibold transition-colors",
              on ? "border-primary text-link" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} tabIndex={0} className="pt-4">
      {children}
    </div>
  );
}
