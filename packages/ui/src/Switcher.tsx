"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SwitcherOption { id: string; label: string; hint?: string }

/** Popover list for company / branch switching. Esc and outside click close it; arrow keys move. */
export function Switcher({ label, options, value, onChange, icon, className }: {
  label: string; options: SwitcherOption[]; value: string; onChange: (id: string) => void; icon?: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    root.current?.querySelector<HTMLElement>("[aria-current='true']")?.focus();
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); btn.current?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>("[role='option']") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-(--control-h) max-w-56 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 font-semibold hover:bg-ground"
      >
        {icon}
        <span className="truncate">{current?.label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute start-0 top-full z-30 mt-1 min-w-full w-64 rounded-card border border-line bg-surface p-1 shadow-pop">
          {options.map((o) => {
            const on = o.id === value;
            return (
              <li
                key={o.id}
                role="option"
                aria-selected={on}
                aria-current={on}
                tabIndex={-1}
                onClick={() => { onChange(o.id); setOpen(false); btn.current?.focus(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(o.id); setOpen(false); btn.current?.focus(); } }}
                className="flex min-h-(--control-h) cursor-pointer items-center gap-2 rounded-md px-3 hover:bg-ground focus:bg-primary-soft"
              >
                <span className="flex-1">
                  <span className="block font-medium">{o.label}</span>
                  {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
                </span>
                {on && <Check className="size-4 text-link" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
